import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { apiError } from "@/lib/http/api-response";
import {
  deleteProposalItemPhoto,
  downloadProposalItemPhoto,
  uploadProposalItemPhoto,
} from "@/lib/proposals/items-repository";

type RouteContext = { params: Promise<{ itemId: string; kind: string }> };

function parseKind(value: string): "original" | "sketch" | null {
  return value === "original" || value === "sketch" ? value : null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, kind } = await context.params;
    const parsedKind = parseKind(kind);
    if (!parsedKind) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });

    const upstream = await downloadProposalItemPhoto(ownerId, itemId, parsedKind);
    if (!upstream) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, kind } = await context.params;
    const parsedKind = parseKind(kind);
    if (!parsedKind) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "missing_file", message: "Файл не передан" }, { status: 400 });
    }

    const item = await uploadProposalItemPhoto(ownerId, itemId, parsedKind, file);
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { itemId, kind } = await context.params;
    const parsedKind = parseKind(kind);
    if (!parsedKind) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });

    const item = await deleteProposalItemPhoto(ownerId, itemId, parsedKind);
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}
