import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status_override } = await req.json() as {
    status_override: "Delayed" | "Cancelled" | null;
  };

  const { error } = await supabaseAdmin
    .from("flights")
    .update({ status_override: status_override ?? null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
