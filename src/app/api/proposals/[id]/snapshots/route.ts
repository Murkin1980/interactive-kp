import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { listProposalApprovalSnapshots } from "@/lib/proposals/repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    const snapshots = await listProposalApprovalSnapshots(id, ownerId);
    return NextResponse.json({ snapshots });
  } catch (error) {
    return apiError(error);
  }
}
