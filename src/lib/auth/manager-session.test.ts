import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
  ManagerAuthenticationError,
  ManagerAuthorizationError,
  ManagerConfigurationError,
  parseManagerMap,
  requireManagerId,
  validateAudience,
  validateIssuer,
} from "./manager-session";
import { apiError } from "@/lib/http/api-response";

const TEST_ISSUER = "https://salamat.cloudflareaccess.com";
const TEST_AUD = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_MANAGER_EMAIL = "manager@salamat-mebel.kz";
const TEST_MANAGER_ID = "550e8400-e29b-41d4-a716-446655440000";

test("Cloudflare Access Manager Session & Auth Adapter", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");

  async function createTestJwt(params?: {
    email?: string | null;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    signWith?: typeof privateKey;
  }) {
    const claims: Record<string, unknown> = {};
    if (params?.email !== undefined) {
      if (params.email !== null) claims.email = params.email;
    } else {
      claims.email = TEST_MANAGER_EMAIL;
    }

    let token = new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(params?.issuer ?? TEST_ISSUER)
      .setAudience(params?.audience ?? TEST_AUD)
      .setIssuedAt();

    if (params?.expiresIn) {
      token = token.setExpirationTime(params.expiresIn);
    } else {
      token = token.setExpirationTime("1h");
    }

    return await token.sign(params?.signWith ?? privateKey);
  }

  await t.test("rejects missing Cf-Access-Jwt-Assertion header with 401", async () => {
    const headers = new Headers();
    await assert.rejects(
      () =>
        requireManagerId(headers, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(err.message, "missing_access_jwt");
        const res = apiError(err);
        assert.equal(res.status, 401);
        return true;
      }
    );
  });

  await t.test("rejects invalid signature, expired token, wrong issuer, or wrong audience with 401", async () => {
    // 1. Invalid signature (signed with different key)
    const { privateKey: foreignKey } = await generateKeyPair("RS256");
    const foreignJwt = await createTestJwt({ signWith: foreignKey });
    const headers1 = new Headers({ "Cf-Access-Jwt-Assertion": foreignJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers1, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(apiError(err).status, 401);
        return true;
      }
    );

    // 2. Expired token
    const expiredJwt = await createTestJwt({ expiresIn: "-10s" });
    const headers2 = new Headers({ "Cf-Access-Jwt-Assertion": expiredJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers2, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(apiError(err).status, 401);
        return true;
      }
    );

    // 3. Wrong issuer
    const wrongIssuerJwt = await createTestJwt({ issuer: "https://other.cloudflareaccess.com" });
    const headers3 = new Headers({ "Cf-Access-Jwt-Assertion": wrongIssuerJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers3, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(apiError(err).status, 401);
        return true;
      }
    );

    // 4. Wrong audience
    const wrongAudJwt = await createTestJwt({ audience: "foreign-audience-token" });
    const headers4 = new Headers({ "Cf-Access-Jwt-Assertion": wrongAudJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers4, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(apiError(err).status, 401);
        return true;
      }
    );
  });

  await t.test("rejects token missing email claim with 401", async () => {
    const noEmailJwt = await createTestJwt({ email: null });
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": noEmailJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: { [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID },
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthenticationError);
        assert.equal(err.message, "missing_access_email");
        assert.equal(apiError(err).status, 401);
        return true;
      }
    );
  });

  await t.test("authenticates valid manager and maps to persistent UUID (case-insensitive)", async () => {
    const validJwt = await createTestJwt({ email: "Manager.User@Salamat-Mebel.KZ" });
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": validJwt });

    const managerId = await requireManagerId(headers, {
      issuer: TEST_ISSUER,
      audience: TEST_AUD,
      managerMap: JSON.stringify({
        "manager.user@salamat-mebel.kz": TEST_MANAGER_ID,
      }),
      jwks: publicKey,
    });

    assert.equal(managerId, TEST_MANAGER_ID);
  });

  await t.test("rejects unmapped email with 403 ManagerAuthorizationError", async () => {
    const unknownJwt = await createTestJwt({ email: "intruder@external-company.kz" });
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": unknownJwt });

    await assert.rejects(
      () =>
        requireManagerId(headers, {
          issuer: TEST_ISSUER,
          audience: TEST_AUD,
          managerMap: JSON.stringify({
            [TEST_MANAGER_EMAIL]: TEST_MANAGER_ID,
          }),
          jwks: publicKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ManagerAuthorizationError);
        assert.equal(err.message, "manager_not_authorized");
        const res = apiError(err);
        assert.equal(res.status, 403);
        return true;
      }
    );
  });

  await t.test("rejects misconfigured issuer, aud, or managerMap with 500 without leaking secrets", async () => {
    // 1. Missing / invalid issuer
    assert.throws(
      () => validateIssuer("http://insecure.cloudflareaccess.com"),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "invalid_access_issuer_config"
    );
    assert.throws(
      () => validateIssuer("https://malicious.evil-domain.com"),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "invalid_access_issuer_config"
    );

    // 2. Missing audience
    assert.throws(
      () => validateAudience("   "),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "missing_access_aud_config"
    );

    // 3. Missing or invalid manager map JSON
    assert.throws(
      () => parseManagerMap(""),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "missing_manager_map_config"
    );
    assert.throws(
      () => parseManagerMap("not-json"),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "invalid_manager_map_config"
    );
    assert.throws(
      () => parseManagerMap("{}"),
      (err: unknown) => err instanceof ManagerConfigurationError && err.message === "invalid_manager_map_config"
    );

    // 4. Verify apiError maps configuration errors safely to 500
    const err = new ManagerConfigurationError("missing_access_issuer_config");
    const response = apiError(err);
    assert.equal(response.status, 500);
    // Payload should only contain generic error, no secrets
    const body = await response.json();
    assert.deepEqual(body, { error: "internal_error" });
  });
});
