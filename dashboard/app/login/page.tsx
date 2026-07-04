"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // remember the last email used on this device so it is pre-filled next time
  useEffect(() => { const saved = localStorage.getItem("tcb_email"); if (saved) setEmail(saved); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      localStorage.setItem("tcb_email", email);
      router.push("/overview");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="mb-1 text-lg font-semibold">The Credit Brothers</div>
        <div className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Sales System</div>
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="mb-4" />
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="mb-4" />
        {error && <div className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</div>}
        <button type="submit" disabled={busy} className="btn w-full">{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
