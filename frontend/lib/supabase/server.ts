import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Use this in Server Components, Server Actions, and Route Handlers — NOT
// in Client Components (use lib/supabase/client.ts there instead).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since
            // middleware.ts handles refreshing the session on every request.
          }
        },
      },
    }
  );
}
