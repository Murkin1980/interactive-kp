import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { addItemOptionGroup, listItemOptionGroups } from "@/lib/proposals/items-repository";
import { kpOptionGroupSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId } = await context.params;
    const groups = await listItemOptionGroups(ownerId, itemId);
    return NextResponse.json({ groups });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpOptionGroupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_option_group", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId } = await context.params;
    const { group, groups } = await addItemOptionGroup(ownerId, itemId, parsed.data);
    return NextResponse.json({ group, groups }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
