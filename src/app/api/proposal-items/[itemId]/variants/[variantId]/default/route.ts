import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { setDefaultProposalVariant } from "@/lib/proposals/items-repository";

type RouteContext = { params: Promise<{ itemId: string; variantId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, variantId } = await context.params;
    const variants = await setDefaultProposalVariant(ownerId, itemId, variantId);
    return NextResponse.json({ variants });
  } catch (error) {
    return apiError(error);
  }
}
