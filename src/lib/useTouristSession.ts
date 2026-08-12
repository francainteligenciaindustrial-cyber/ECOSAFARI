import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { adminFetch } from "./adminFetch";
import { Turista } from "../types";

// Tracks whether the current visitor is logged in with a tourist account
// (Supabase Auth app_metadata.role === "tourist") and loads their profile.
// Shared by every place a review can be submitted, since avaliar now
// requires having a perfil de turista (see requireTourist in server.ts).
// adminFetch just attaches whatever Supabase session token exists — despite
// the name, it works for any authenticated role, tourist included.
export function useTouristSession() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checking, setChecking] = useState(true);
  const [isTourist, setIsTourist] = useState(false);
  const [profile, setProfile] = useState<Turista | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setIsTourist(data.session?.user?.app_metadata?.role === "tourist");
        setChecking(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setIsTourist(session?.user?.app_metadata?.role === "tourist");
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isTourist) {
      setProfile(null);
      return;
    }
    adminFetch("/api/turista/me")
      .then(res => (res.ok ? res.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [isTourist]);

  return { supabase, checking, isTourist, profile };
}
