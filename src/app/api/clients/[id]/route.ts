import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { deleteClient, getClient, updateClient } from "@/lib/clients/repository";
import { apiError } from "@/lib/http/api-response";
import { clientSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    const client = await getClient(id, ownerId);
    return client
      ? NextResponse.json({ client })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_client", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await context.params;
    const client = await updateClient(id, ownerId, parsed.data);
    return client
      ? NextResponse.json({ client })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireManagerId();
    const { id } = await context.params;
    return (await deleteClient(id, ownerId))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
