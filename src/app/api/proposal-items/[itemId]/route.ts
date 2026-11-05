import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { deleteProposalItem, updateProposalItem } from "@/lib/proposals/items-repository";
import { kpItemUpdateSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpItemUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_item", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId } = await context.params;
    const item = await updateProposalItem(ownerId, itemId, parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId } = await context.params;
    const deleted = await deleteProposalItem(ownerId, itemId);
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
