import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { deleteProposalVariant, updateProposalVariant } from "@/lib/proposals/items-repository";
import { kpItemVariantSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string; variantId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpItemVariantSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_variant", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId, variantId } = await context.params;
    const variants = await updateProposalVariant(ownerId, itemId, variantId, parsed.data);
    return NextResponse.json({ variants });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, variantId } = await context.params;
    const variants = await deleteProposalVariant(ownerId, itemId, variantId);
    return NextResponse.json({ variants });
  } catch (error) {
    return apiError(error);
  }
}
