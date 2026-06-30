import { createBrowserClient } from "@supabase/ssr";

// Use this in Client Components ("use client" files) — handles the
// browser-side half of cookie-based session storage.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
