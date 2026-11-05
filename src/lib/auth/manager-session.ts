import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export class ManagerAuthenticationError extends Error {
  constructor(message = "manager_authentication_required") {
    super(message);
    this.name = "ManagerAuthenticationError";
  }
}

export class ManagerAuthorizationError extends Error {
  constructor(message = "manager_authorization_denied") {
    super(message);
    this.name = "ManagerAuthorizationError";
  }
}

export class ManagerConfigurationError extends Error {
  constructor(message = "manager_auth_misconfigured") {
    super(message);
    this.name = "ManagerConfigurationError";
  }
}

export type AccessKeyResolver = Parameters<typeof jwtVerify>[1];

export interface VerifyCloudflareAccessOptions {
  issuer?: string;
  audience?: string;
  managerMap?: string | Record<string, string>;
  jwks?: AccessKeyResolver;
  allowCustomIssuer?: boolean;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getOrCreateRemoteJWKSet(issuer: string): JWTVerifyGetKey {
  let cached = jwksCache.get(issuer);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, cached);
  }
  return cached;
}

export function parseManagerMap(rawMap?: string | Record<string, string> | null): Record<string, string> {
  if (!rawMap) {
    throw new ManagerConfigurationError("missing_manager_map_config");
  }

  let parsed: unknown = rawMap;
  if (typeof rawMap === "string") {
    try {
      parsed = JSON.parse(rawMap);
    } catch {
      throw new ManagerConfigurationError("invalid_manager_map_config");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ManagerConfigurationError("invalid_manager_map_config");
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof key === "string" && typeof value === "string") {
      const email = key.trim().toLowerCase();
      const managerId = value.trim();
      if (email && managerId) {
        normalized[email] = managerId;
      }
    }
  }

  if (Object.keys(normalized).length === 0) {
    throw new ManagerConfigurationError("invalid_manager_map_config");
  }

  return normalized;
}

export function validateIssuer(rawIssuer?: string, allowCustomIssuer = false): string {
  if (!rawIssuer || typeof rawIssuer !== "string" || !rawIssuer.trim()) {
    throw new ManagerConfigurationError("missing_access_issuer_config");
  }
  const issuer = rawIssuer.trim().replace(/\/+$/, "");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(issuer);
  } catch {
    throw new ManagerConfigurationError("invalid_access_issuer_config");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new ManagerConfigurationError("invalid_access_issuer_config");
  }

  if (!allowCustomIssuer && !parsedUrl.hostname.endsWith(".cloudflareaccess.com")) {
    throw new ManagerConfigurationError("invalid_access_issuer_config");
  }

  return issuer;
}

export function validateAudience(rawAud?: string): string {
  if (!rawAud || typeof rawAud !== "string" || !rawAud.trim()) {
    throw new ManagerConfigurationError("missing_access_aud_config");
  }
  return rawAud.trim();
}

export function extractAccessJwt(headers: Headers): string | null {
  return headers.get("cf-access-jwt-assertion") || headers.get("Cf-Access-Jwt-Assertion");
}

export async function verifyAccessIdentity(
  headers: Headers,
  options?: VerifyCloudflareAccessOptions
): Promise<string> {
  const assertion = extractAccessJwt(headers);
  if (!assertion) {
    throw new ManagerAuthenticationError("missing_access_jwt");
  }

  const rawIssuer = options?.issuer ?? process.env.CLOUDFLARE_ACCESS_ISSUER;
  const issuer = validateIssuer(rawIssuer, options?.allowCustomIssuer ?? false);

  const rawAud = options?.audience ?? process.env.CLOUDFLARE_ACCESS_AUD;
  const audience = validateAudience(rawAud);

  const key = options?.jwks ?? getOrCreateRemoteJWKSet(issuer);

  let verified;
  try {
    verified = await jwtVerify(assertion, key, {
      issuer,
      audience,
    });
  } catch {
    throw new ManagerAuthenticationError("invalid_access_jwt");
  }

  const payload = verified.payload;
  if (!payload || typeof payload.email !== "string" || !payload.email.trim()) {
    throw new ManagerAuthenticationError("missing_access_email");
  }

  return payload.email.trim().toLowerCase();
}

async function resolveHeaders(requestOrHeaders?: Request | Headers | null): Promise<Headers> {
  if (requestOrHeaders instanceof Headers) return requestOrHeaders;
  if (requestOrHeaders && "headers" in requestOrHeaders && requestOrHeaders.headers instanceof Headers) {
    return requestOrHeaders.headers;
  }
  const { headers } = await import("next/headers");
  return await headers();
}

/**
 * Validates Cloudflare Access identity on server routes and resolves
 * the verified email to the persistent manager UUID.
 *
 * Direct browser access to MiniBase or credentials is fully avoided;
 * this module runs strictly on the server boundary.
 */
export async function requireManagerId(
  requestOrHeaders?: Request | Headers | null,
  options?: VerifyCloudflareAccessOptions
): Promise<string> {
  const mapSource = options?.managerMap ?? process.env.CLOUDFLARE_ACCESS_MANAGER_MAP;
  const managerMap = parseManagerMap(mapSource);

  const headers = await resolveHeaders(requestOrHeaders);
  const email = await verifyAccessIdentity(headers, options);

  const managerId = managerMap[email];
  if (!managerId) {
    throw new ManagerAuthorizationError("manager_not_authorized");
  }

  return managerId;
}
