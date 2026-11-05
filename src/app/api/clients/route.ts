import { NextResponse } from "next/server";
import { requireManagerId } from "@/lib/auth/manager-session";
import { createClient, listClients } from "@/lib/clients/repository";
import { apiError } from "@/lib/http/api-response";
import { clientSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ownerId = await requireManagerId();
    return NextResponse.json({ clients: await listClients(ownerId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireManagerId();
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_client", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json({ client: await createClient(ownerId, parsed.data) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
