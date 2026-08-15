import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { adminFetch } from "./adminFetch";
import { isTouristUser } from "./authRoles";
import { Turista } from "../types";

// Tracks whether the current visitor is logged in with a tourist profile
// (app_metadata.isTourist === true, or the legacy role === "tourist") and
// loads their profile. Also exposes hasSession/user so callers can tell
// "not logged in at all" apart from "logged in, but as admin/partner, not
// as tourist" — those need different UI (ver TouristProfileWidget.tsx).
// Shared by every place a review can be submitted, since avaliar now
// requires having a perfil de turista (see requireTourist in server.ts).
// adminFetch just attaches whatever Supabase session token exists — despite
// the name, it works for any authenticated role, tourist included.
export function useTouristSession() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checking, setChecking] = useState(true);
  const [isTourist, setIsTourist] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Turista | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setUser(data.session?.user || null);
        setIsTourist(isTouristUser(data.session?.user));
        setChecking(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
        setIsTourist(isTouristUser(session?.user));
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

  return { supabase, checking, isTourist, hasSession: !!user, user, profile };
}
