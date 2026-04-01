import { createClient } from "@supabase/supabase-js";

// Admin client with service role — bypasses RLS.
// NEVER expose this to the browser. Server-side / Cron jobs only.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
