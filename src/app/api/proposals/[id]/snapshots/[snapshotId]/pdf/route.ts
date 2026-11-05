import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import { downloadProposalSnapshotPdf } from "@/lib/proposals/repository";

type RouteContext = { params: Promise<{ id: string; snapshotId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id, snapshotId } = await context.params;
    const result = await downloadProposalSnapshotPdf(id, snapshotId, ownerId);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(result.response.body, {
      status: 200,
      headers: {
        "content-type": result.response.headers.get("content-type") || "application/pdf",
        "content-disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
