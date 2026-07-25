import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientPromise: Promise<SupabaseClient> | null = null;

// The Supabase URL and anon key are fetched from the backend instead of being
// baked into the frontend build, so they always match the server's active
// configuration (env vars or defaults) without needing a separate VITE_ copy.
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = fetch("/api/config")
      .then((res) => res.json())
      .then(({ supabaseUrl, supabaseAnonKey }) => createClient(supabaseUrl, supabaseAnonKey));
  }
  return clientPromise;
}
