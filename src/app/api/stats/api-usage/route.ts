import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count, error } = await supabaseAdmin
    .from("api_calls")
    .select("*", { count: "exact", head: true })
    .gte("called_at", startOfMonth.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ used: count ?? 0, limit: 500 });
}
