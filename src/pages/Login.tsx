import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { errorMessage, supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export default function Login() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (!loading && session) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : errorMessage(error));
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_1fr]">
      {/* The brand half, in the navy. */}
      <div className="relative hidden overflow-hidden bg-navy lg:block">
        <div className="pointer-events-none absolute -top-24 -right-24 size-[420px] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[360px] rounded-full bg-brand-700/30 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-ice">
          <span className="grid size-16 place-items-center rounded-full bg-white">
            <img src="/nam-mark.png" alt="" className="size-12 object-contain" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-ice/70 uppercase">Mainframe</p>
            <p className="mt-3 font-display text-4xl leading-tight tracking-[0.12em]">NAM GROUP</p>
            <p className="mt-2 max-w-sm text-ice/75">Every business on one KPI board — scored the same way, month by month.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center bg-mist-100 p-4 lg:bg-white">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-level-3 lg:shadow-none">
          <img src="/nam-mark.png" alt="" className="mb-5 size-14 object-contain lg:hidden" />
          <p className="eyebrow">NAM Group</p>
          <h1 className="mt-1 font-display text-[28px] font-medium text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to open the KPI board.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              {(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Password">
              {(id) => (
                <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              )}
            </Field>
            <ErrorBox>{error}</ErrorBox>
            <Button type="submit" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
