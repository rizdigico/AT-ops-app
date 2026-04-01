import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function DELETE() {
  const { error, count } = await supabaseAdmin
    .from("flights")
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // matches all rows

  if (error) {
    console.error("[flights/clear] Delete error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
