"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, signInWithCustomTokenAndGetHousehold } from "@/lib/firebaseClient";

export default function SignIn() {
  const [householdId, setHouseholdId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [qrId, setQrId] = useState("");
  const [status, setStatus] = useState<string>("Idle");
  const [log, setLog] = useState<string>("");

  const append = (line: string) => setLog((s) => s + (s ? "\n" : "") + line);

  const seed = async () => {
    setStatus("Creating dev household...");
    setLog("");
    try {
      const fn = httpsCallable(functions, "createDevHousehold");
      const res: any = await fn({});
      const data = res?.data || {};
      setHouseholdId(data.householdId || "");
      setMemberId(data.memberId || "");
      setQrId(data.qrId || "");
      append(`Seeded:\nhouseholdId=${data.householdId}\nmemberId=${data.memberId}\nqrId=${data.qrId}`);
      setStatus("Dev household created. Ready to sign in.");
    } catch (e: any) {
      console.error("Seed error:", e);
      setStatus(`Seed error: ${(e.code || "unknown")} – ${e.message || e}`);
    }
  };

  const signIn = async () => {
    setStatus("Signing in...");
    setLog("");
    const payload = { householdId, memberId, qrId };
    append("Sending payload: " + JSON.stringify(payload));
    if (!householdId || !memberId || !qrId) {
      setStatus("Missing data – click 'Create Dev Household + Member' first.");
      return;
    }
    try {
      const fn = httpsCallable(functions, "signInWithQr");
      const res: any = await fn(payload);
      const customToken = res?.data?.customToken as string;
      append("Received customToken: " + (customToken ? "[ok]" : "[missing]"));
      const hh = await signInWithCustomTokenAndGetHousehold(customToken);
      setStatus("Signed in. Household: " + (hh ?? "(none)"));
    } catch (e: any) {
      console.error("Sign-in error:", e);
      setStatus(`Sign-in error: ${(e.code || "unknown")} – ${e.message || e}`);
    }
  };

  return (
    <main className="p-6 space-y-4 max-w-md">
      <h1 className="text-xl font-semibold">QR-kirjautuminen</h1>

      <button onClick={seed} className="bg-gray-800 text-white rounded px-4 py-2">
        Create Dev Household + Member
      </button>

      <div className="space-y-2">
        <label className="block text-sm">householdId</label>
        <input className="border rounded p-2 w-full" value={householdId} onChange={e=>setHouseholdId(e.target.value)} />
        <label className="block text-sm">memberId (uid)</label>
        <input className="border rounded p-2 w-full" value={memberId} onChange={e=>setMemberId(e.target.value)} />
        <label className="block text-sm">qrId</label>
        <input className="border rounded p-2 w-full" value={qrId} onChange={e=>setQrId(e.target.value)} />

        <button
          onClick={signIn}
          disabled={!householdId || !memberId || !qrId}
          className="bg-black text-white rounded px-4 py-2 w-full disabled:opacity-50"
        >
          Sign in with QR
        </button>
      </div>

      <p className="text-sm text-gray-600">Status: {status}</p>

      <pre className="text-xs p-2 bg-gray-50 border rounded whitespace-pre-wrap">{log}</pre>
    </main>
  );
}
