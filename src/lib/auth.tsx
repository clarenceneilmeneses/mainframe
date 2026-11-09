import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "owner" | "editor" | "viewer";

interface AuthState {
  session: Session | null;
  /** null = signed in but not on the members list (or the list doesn't exist yet). */
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function apply(next: Session | null) {
      setSession(next);
      if (!next) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.rpc("my_role");
      if (!cancelled) {
        setRole((data as Role | null) ?? null);
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED") {
        setSession(next);
        return;
      }
      // Run outside the auth callback; Supabase warns against awaiting inside it.
      setTimeout(() => apply(next), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    role,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const canEdit = (role: Role | null) => role === "owner" || role === "editor";
