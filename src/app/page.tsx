// src/app/page.tsx
"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebaseClient";

export default function Home() {
  const [status, setStatus] = useState("Idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const callSsrapp = async () => {
    setStatus("Calling...");
    setError(null);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "ssrapp");
      const res = await fn({});
      setResult(res.data);
      setStatus("OK");
    } catch (e: any) {
      // Show full Firebase callable error info
      console.error("Callable error:", e);
      setError(`${e.code || "unknown"} – ${e.message || e.toString()}`);
      setStatus("Error");
    }
  };
  

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Perheen kotityöt — test</h1>
      <p className="text-gray-600">
        This button calls the callable function <code>ssrapp</code> in{" "}
        <strong>europe-north1</strong>. In dev, it uses the local emulator.
      </p>

      <button
        onClick={callSsrapp}
        className="rounded bg-black text-white px-4 py-2"
      >
        Call ssrapp
      </button>

      <div className="text-sm">
        <div>Status: {status}</div>
        {result && (
          <pre className="mt-2 p-2 bg-gray-100 rounded">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {error && (
          <pre className="mt-2 p-2 bg-red-100 rounded text-red-700">
            {error}
          </pre>
        )}
      </div>
    </main>
  );
}
