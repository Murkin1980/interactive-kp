import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { createProposal, listProposals } from "@/lib/proposals/repository";
import { apiError } from "@/lib/http/api-response";
import { kpSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ownerId = await requireManagerId();
    return NextResponse.json({ proposals: await listProposals(ownerId) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_proposal", issues: parsed.error.issues }, { status: 400 });
    return NextResponse.json({ proposal: await createProposal(ownerId, parsed.data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
