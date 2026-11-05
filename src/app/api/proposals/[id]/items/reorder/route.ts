import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { reorderProposalItems } from "@/lib/proposals/items-repository";
import { kpItemsReorderSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpItemsReorderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_reorder", issues: parsed.error.issues }, { status: 400 });
    }
    const { id: kpId } = await context.params;
    const items = await reorderProposalItems(ownerId, kpId, parsed.data.item_ids);
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
