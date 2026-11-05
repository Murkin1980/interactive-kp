import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { deleteItemOptionGroup } from "@/lib/proposals/items-repository";

type RouteContext = { params: Promise<{ itemId: string; groupId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, groupId } = await context.params;
    const groups = await deleteItemOptionGroup(ownerId, itemId, groupId);
    return NextResponse.json({ groups });
  } catch (error) {
    return apiError(error);
  }
}
