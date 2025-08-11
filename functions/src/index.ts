// Firebase Admin (modular)
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Firebase Functions v2
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten, type FirestoreEvent } from "firebase-functions/v2/firestore";
import { onObjectFinalized, type StorageObjectData } from "firebase-functions/v2/storage";
import type { CloudEvent } from "firebase-functions/v2";
import { HttpsError } from "firebase-functions/v2/https";

import { addMinutes } from "date-fns";


// Force Admin SDK to use Auth emulator when functions run locally


if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}


// --- Init Admin SDK once ---
if (!getApps().length) initializeApp();
const db = getFirestore();

/**
 * Callable function: ssrapp
 * Call from frontend with: httpsCallable(functions, "ssrapp")
 */
export const ssrapp = onCall(
  { region: "europe-north1" },
  async (): Promise<{ message: string }> => {
    return { message: "Hello from ssrapp in europe-north1!" };
  }
);

/**
 * Callable function: signInWithQr
 * Exchange qrId for a custom token and rotate qrId
 */
export const signInWithQr = onCall(
  { region: "europe-north1" },
  async (req): Promise<{ customToken: string }> => {
    console.log("signInWithQr req.data:", req.data);
    const { qrId, householdId, memberId } = (req.data || {}) as {
      qrId?: string; householdId?: string; memberId?: string;
    };
    if (!qrId || !householdId || !memberId) {
      throw new HttpsError("invalid-argument", "Missing qrId/householdId/memberId");
    }

    const memberRef = db.doc(`households/${householdId}/members/${memberId}`);
    const snap = await memberRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Member not found");

    const data = snap.data() as any;
    if (data.qrId !== qrId) throw new HttpsError("permission-denied", "QR invalid or rotated");

    const uid: string = data.uid || memberId;
    try {
      const customToken = await getAuth().createCustomToken(uid, { householdId });
      const newQr = Math.random().toString(36).slice(2, 10);
      await memberRef.update({ qrId: newQr, lastQrUseAt: FieldValue.serverTimestamp() });
      return { customToken };
    } catch (e: any) {
      console.error("createCustomToken failed:", e); // <- shows in Emulator UI logs
      throw new HttpsError("internal", "Failed to create custom token");
    }
  }
);

/**
 * Scheduler: rotate all member qrId values daily at 02:00 Europe/Helsinki
 */
export const rotateQrCodes = onSchedule(
  { schedule: "every day 02:00", timeZone: "Europe/Helsinki", region: "europe-north1" },
  async () => {
    const batch = db.batch();

    // Touch households (optional audit marker)
    const households = await db.collection("households").get();
    households.forEach((h) => {
      batch.update(h.ref, { rotatedAt: FieldValue.serverTimestamp() });
    });

    // Rotate members' qrId
    const members = await db.collectionGroup("members").get();
    members.forEach((m) => {
      batch.update(m.ref, { qrId: Math.random().toString(36).slice(2, 10) });
    });

    await batch.commit();
  }
);

/**
 * Scheduler: send due-soon notifications every 15 minutes
 */
export const sendDueNotifications = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Europe/Helsinki", region: "europe-north1" },
  async () => {
    const now = Timestamp.now();
    const soon = Timestamp.fromDate(addMinutes(now.toDate(), 15));

    const choresSnap = await db
      .collectionGroup("chores")
      .where("status", "==", "open")
      .where("dueAt", ">=", now)
      .where("dueAt", "<=", soon)
      .get();

    const tokens: string[] = [];

    for (const doc of choresSnap.docs) {
      const d = doc.data() as any;
      const householdId = doc.ref.parent.parent?.id;
      if (!householdId) continue;

      const assignees: string[] = Array.isArray(d.assignees) ? d.assignees : [];
      if (!assignees.length) continue;

      const ms = await db
        .collection(`households/${householdId}/members`)
        .where("uid", "in", assignees.slice(0, 10))
        .get();

      ms.forEach((m) => {
        const t = (m.data().notificationTokens || []) as string[];
        tokens.push(...t);
      });
    }

    if (tokens.length) {
      await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: "Tehtävä erääntyy pian",
          body: "Muistutus: tarkista tämän päivän tehtävät",
        },
      });
    }
  }
);

/**
 * Scheduler: apply repeat rules daily at 03:00 (stub for MVP)
 */
export const applyRepeatRules = onSchedule(
  { schedule: "every day 03:00", timeZone: "Europe/Helsinki", region: "europe-north1" },
  async () => {
    // TODO: implement RRULE logic (DAILY/WEEKLY minimal for MVP)
  }
);

/**
 * Firestore trigger: on chore completed -> increment points for assignees
 */
export const onChoreCompleted = onDocumentWritten(
  { document: "households/{h}/chores/{c}", region: "europe-north1" },
  async (event: FirestoreEvent<any>) => {
    const before = event.data?.before?.data() as any | undefined;
    const after = event.data?.after?.data() as any | undefined;

    if (before?.status === "open" && after?.status === "done") {
      const points: number = typeof after.points === "number" ? after.points : 1;
      const assignees: string[] = Array.isArray(after.assignees) ? after.assignees : [];
      const membersCol = event.data!.after!.ref.parent.parent!.collection("members");

      for (const uid of assignees) {
        await membersCol.doc(uid).set(
          { points: FieldValue.increment(points) },
          { merge: true }
        );
      }
    }
  }
);

/**
 * Storage trigger: image uploaded -> (later) resize & set TTL
 */
export const resizeProofImage = onObjectFinalized(
  { region: "europe-north1" },
  async (e: CloudEvent<StorageObjectData>) => {
    console.log("Proof uploaded:", e.data.name);
    // TODO: resize + set TTL
  }
);


// DEV ONLY: create a household + one member with a qrId
export const createDevHousehold = onCall(
  { region: "europe-north1" },
  async (): Promise<{ householdId: string; memberId: string; qrId: string }> => {
    try {
      const householdRef = db.collection("households").doc();
      const memberRef = householdRef.collection("members").doc(); // doc id becomes uid in MVP
      const qrId = Math.random().toString(36).slice(2, 10);

      await householdRef.set({
        name: "Dev Household",
        locale: "fi-FI",
        timezone: "Europe/Helsinki",
        createdAt: Timestamp.now(),
        maxMembers: 10
      });

      await memberRef.set({
        uid: memberRef.id,
        displayName: "Test Member",
        role: "parent",
        age: 15,
        qrId,
        notificationTokens: [],
        createdAt: Timestamp.now()
      });

      return { householdId: householdRef.id, memberId: memberRef.id, qrId };
    } catch (e: any) {
      console.error("createDevHousehold failed:", e);
      throw new HttpsError("internal", "createDevHousehold failed");
    }
  }
);

export const seedExactMember = onCall(
  { region: "europe-north1" },
  async (req): Promise<{ ok: true }> => {
    const { householdId, memberId, qrId } = req.data || {};
    if (!householdId || !memberId || !qrId) throw new HttpsError("invalid-argument","missing");
    const householdRef = db.doc(`households/${householdId}`);
    await householdRef.set({ createdAt: Timestamp.now() }, { merge: true });
    await householdRef.collection("members").doc(memberId).set({
      uid: memberId, qrId, createdAt: Timestamp.now()
    }, { merge: true });
    return { ok: true };
  }
);