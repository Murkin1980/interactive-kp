import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { publishProposal } from "@/lib/proposals/repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    const proposal = await publishProposal(id, ownerId);
    return proposal
      ? NextResponse.json({ proposal })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
