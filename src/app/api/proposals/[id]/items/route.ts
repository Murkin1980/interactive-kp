import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { createProposalItem, listProposalItems } from "@/lib/proposals/items-repository";
import { kpItemSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id: kpId } = await context.params;
    return NextResponse.json({ items: await listProposalItems(ownerId, kpId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_item", issues: parsed.error.issues }, { status: 400 });
    }
    const { id: kpId } = await context.params;
    const item = await createProposalItem(ownerId, kpId, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
