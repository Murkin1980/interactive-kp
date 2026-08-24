import "server-only";

export interface MiniBaseRecord<T extends Record<string, unknown>> {
  id: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface MiniBaseList<T extends Record<string, unknown>> {
  records: MiniBaseRecord<T>[];
  nextAfter: string | null;
}

export class MiniBaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "MiniBaseError";
  }
}

const collectionPattern = /^[a-z][a-z0-9_-]{1,62}$/;
const recordIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const filePathPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

function cleanBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("insecure_minibase_url");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("invalid_minibase_url");
  return url.toString().replace(/\/+$/, "");
}

function validateServerKey(value: string): string {
  if (!value.startsWith("mb_secret_")) throw new Error("invalid_minibase_server_key");
  return value;
}

async function parseError(response: Response): Promise<never> {
  let code = `http_${response.status}`;
  try {
    const body = await response.json() as { error?: { code?: unknown } };
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // Preserve the status-derived code for non-JSON proxy failures.
  }
  throw new MiniBaseError(code, response.status);
}

export class MiniBaseServerClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly requestFetch: typeof fetch,
  ) {}

  static fromEnvironment(requestFetch: typeof fetch = globalThis.fetch.bind(globalThis)): MiniBaseServerClient {
    const baseUrl = process.env.MINIBASE_URL;
    const key = process.env.MINIBASE_SECRET_KEY;
    if (!baseUrl || !key) throw new Error("minibase_environment_missing");
    return new MiniBaseServerClient(cleanBaseUrl(baseUrl), validateServerKey(key), requestFetch);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.key}`,
        ...(init.body && !(init.body instanceof Blob) ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) return parseError(response);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private collectionPath(collection: string, id?: string): string {
    if (!collectionPattern.test(collection)) throw new Error("invalid_collection");
    if (id !== undefined && !recordIdPattern.test(id)) throw new Error("invalid_record_id");
    return `/v1/data/${encodeURIComponent(collection)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
  }

  private filePath(path: string): string {
    if (!filePathPattern.test(path) || path.includes("..") || path.includes("//") || path.endsWith("/")) {
      throw new Error("invalid_file_path");
    }
    return path.split("/").map(encodeURIComponent).join("/");
  }

  list<T extends Record<string, unknown>>(
    collection: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<MiniBaseList<T>> {
    const path = this.collectionPath(collection);
    const query = new URLSearchParams();
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error("invalid_limit");
      query.set("limit", String(options.limit));
    }
    if (options.after !== undefined) {
      if (!recordIdPattern.test(options.after)) throw new Error("invalid_record_id");
      query.set("after", options.after);
    }
    return this.request(`${path}${query.size ? `?${query}` : ""}`);
  }

  get<T extends Record<string, unknown>>(collection: string, id: string): Promise<MiniBaseRecord<T>> {
    return this.request(this.collectionPath(collection, id));
  }

  put<T extends Record<string, unknown>>(collection: string, id: string, data: T): Promise<{ id: string; data: T; updatedAt: string }> {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_record_data");
    return this.request(this.collectionPath(collection, id), { method: "PUT", body: JSON.stringify(data) });
  }

  delete(collection: string, id: string): Promise<void> {
    return this.request(this.collectionPath(collection, id), { method: "DELETE" });
  }

  async downloadFile(path: string): Promise<Response> {
    const response = await this.requestFetch(`${this.baseUrl}/v1/files/${this.filePath(path)}`, {
      headers: { authorization: `Bearer ${this.key}` },
    });
    if (!response.ok) return parseError(response);
    return response;
  }

  uploadFile(path: string, body: Blob): Promise<{ path: string; size: number; contentType: string; etag: string; updatedAt: string }> {
    return this.request(`/v1/files/${this.filePath(path)}`, {
      method: "PUT",
      body,
      headers: {
        "content-type": body.type || "application/octet-stream",
        "content-length": String(body.size),
      },
    });
  }

  deleteFile(path: string): Promise<void> {
    return this.request(`/v1/files/${this.filePath(path)}`, { method: "DELETE" });
  }
}
