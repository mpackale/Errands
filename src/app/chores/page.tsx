"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebaseClient";
import {
  collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp
} from "firebase/firestore";

export default function ChoresPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [chores, setChores] = useState<any[]>([]);

  // read householdId from auth token claims
  useEffect(() => {
    const unsub = auth.onIdTokenChanged(async (u) => {
      if (!u) { setHouseholdId(null); return; }
      const token = await u.getIdTokenResult(true);
      setHouseholdId((token.claims as any).householdId ?? null);
    });
    return () => unsub();
  }, []);

  // subscribe to chores
  useEffect(() => {
    if (!householdId) return;
    const col = collection(db, "households", householdId, "chores");
    const qy = query(col, orderBy("dueAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => {
      setChores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [householdId]);

  const canUse = useMemo(() => !!householdId, [householdId]);

  const addChore = async () => {
    if (!canUse || !title.trim()) return;
    const col = collection(db, "households", householdId!, "chores");
    await addDoc(col, {
      title: title.trim(),
      notes: "",
      assignees: [auth.currentUser?.uid].filter(Boolean),
      dueAt: serverTimestamp(),
      repeatRule: null,
      points: 1,
      requiresProof: false,
      status: "open",
      createdBy: auth.currentUser?.uid ?? "system",
      createdAt: serverTimestamp()
    });
    setTitle("");
  };

  const toggleDone = async (id: string, status: string) => {
    if (!canUse) return;
    const ref = doc(db, "households", householdId!, "chores", id);
    await updateDoc(ref, {
      status: status === "open" ? "done" : "open",
      completedAt: status === "open" ? serverTimestamp() : null
    });
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Kotityöt</h1>

      {!canUse && (
        <div className="text-sm text-red-600">
          Et ole kirjautunut. Mene sivulle <a className="underline" href="/signin">/signin</a>.
        </div>
      )}

      {canUse && (
        <>
          <div className="flex gap-2">
            <input
              className="border rounded p-2 flex-1"
              placeholder="Uusi kotityö…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button onClick={addChore} className="bg-black text-white rounded px-4 py-2">
              Lisää
            </button>
          </div>

          <ul className="space-y-2">
            {chores.map((c) => (
              <li key={c.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-gray-500">tila: {c.status}</div>
                </div>
                <button
                  onClick={() => toggleDone(c.id, c.status)}
                  className="px-3 py-1 rounded border"
                >
                  {c.status === "open" ? "Merkitse tehdyksi" : "Peru"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
