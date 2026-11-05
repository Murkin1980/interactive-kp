import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { addItemOptionValue } from "@/lib/proposals/items-repository";
import { kpOptionValueSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ itemId: string; groupId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpOptionValueSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_option_value", issues: parsed.error.issues }, { status: 400 });
    }
    const { itemId, groupId } = await context.params;
    const groups = await addItemOptionValue(ownerId, itemId, groupId, parsed.data);
    return NextResponse.json({ groups }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
