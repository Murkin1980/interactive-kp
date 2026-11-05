import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { addItemSimpleAddOn } from "@/lib/proposals/items-repository";
import { kpSimpleAddOnSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpSimpleAddOnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_add_on", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId } = await context.params;
    const { group, groups } = await addItemSimpleAddOn(ownerId, itemId, parsed.data);
    return NextResponse.json({ group, groups }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
