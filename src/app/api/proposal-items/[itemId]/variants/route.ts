import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { addProposalVariant } from "@/lib/proposals/items-repository";
import { kpItemVariantSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpItemVariantSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_variant", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId } = await context.params;
    const { variant, variants } = await addProposalVariant(ownerId, itemId, parsed.data);
    return NextResponse.json({ variant, variants }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
