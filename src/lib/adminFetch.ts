import { getSupabaseClient } from "./supabaseClient";

// Wraps fetch() for admin-only API calls, attaching the current Supabase
// session's access token as a Bearer header. The backend's requireAdmin
// middleware verifies that token and the caller's app_metadata.role.
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const supabase = await getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}
