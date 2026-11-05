import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { deleteProposal, getProposal, updateProposal } from "@/lib/proposals/repository";
import { kpUpdateSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    const proposal = await getProposal(id, ownerId);
    return proposal
      ? NextResponse.json({ proposal })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = kpUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_proposal", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await context.params;
    const proposal = await updateProposal(id, ownerId, parsed.data);
    return proposal
      ? NextResponse.json({ proposal })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    const deleted = await deleteProposal(id, ownerId);
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
