# Residual Supabase Dependencies & Migration Roadmap

Status: ACTIVE BOUNDARY  
Repository: `Murkin1980/interactive-kp`  
Branch: `feature/minibase-migration`

---

## 1. Current State of Supabase Dependencies

The authentication layer has been 100% decoupled from Supabase:
- `src/lib/auth/manager-session.ts` -> Cloudflare Access JWT + JWKS verification.
- `src/features/auth/login-form.tsx` -> Cloudflare Access info view.
- `src/features/auth/auth-boundary.tsx` -> Transparent boundary wrapper.
- `src/components/layout/sidebar.tsx` -> Cloudflare Access session termination dialog.
- `src/app/auth/callback/route.ts` -> Clean redirect to `/dashboard`.

The `@supabase/*` npm packages remain installed solely to power the 3 unmigrated UI/business modules described below.

---

## 2. Unmigrated Modules (Residual Dependencies)

| Module | Location | Current Supabase Usage | Target Architecture |
| :--- | :--- | :--- | :--- |
| **Dashboard Analytics** | `src/features/dashboard/dashboard-content.tsx` | Browser client queries `clients` and `proposals` tables for metrics, active proposals, and recent clients. | Dedicated server API route `/api/dashboard/stats` querying MiniBase collections `clients_<ownerId>` and `proposals_<ownerId>`. |
| **Public Proposal View** | `src/features/proposals/public-proposal-view.tsx` | Browser client queries `proposals` by `public_token`, loads items/variants, and updates proposal status upon confirmation. | Server API route `/api/public/proposals/[token]` with public-token validation, status locks, and immutable snapshot creation in MiniBase. |
| **Branding Settings** | `src/features/settings/branding-settings.tsx` | Browser client queries and updates `brand_settings` table and uploads studio logos to Supabase Storage. | Server API route `/api/settings/branding` storing studio branding in MiniBase settings records and logos in MiniBase Files API. |

> [!IMPORTANT]
> - Do NOT delete `@supabase/supabase-js` or `@supabase/ssr` until all 3 modules above are migrated.
> - Do NOT modify public tokens or existing manager UUIDs during migration.
> - All future server routes must preserve tenant isolation and strict validation.

---

## 3. Checkpoint Roadmap for Remaining Migration

### Stage 1: Branding & Settings Migration (`IKP-MB-STAGE1`)
- Create server-side settings repository using MiniBase records (`settings_<ownerId>`).
- Implement `/api/settings/branding` (GET / PUT).
- Implement logo upload via MiniBase Files API.
- Migrate `src/features/settings/branding-settings.tsx` to browser API caller without Supabase.

### Stage 2: Dashboard Analytics Migration (`IKP-MB-STAGE2`)
- Implement `/api/dashboard/summary` server route.
- Aggregate metrics (active proposals, won deals, client counts) directly from existing MiniBase collections (`proposals_<ownerId>`, `clients_<ownerId>`).
- Migrate `src/features/dashboard/dashboard-content.tsx` to consume `/api/dashboard/summary`.

### Stage 3: Public Proposal View & Confirmation (`IKP-MB-STAGE3`)
- Implement server-side public proposal lookup by token via server route `/api/public/proposals/[token]`.
- Enforce public token expiration, version tracking, and immutable approval snapshot generation in MiniBase.
- Migrate `src/features/proposals/public-proposal-view.tsx` to consume the server endpoint.
- Verify immutable PDF generation and storage in MiniBase Files.

### Stage 4: Package Clean-up & Final Cutover (`IKP-MB-STAGE4`)
- Remove `@supabase/supabase-js` and `@supabase/ssr` from `package.json`.
- Delete `src/lib/supabase/*` directory.
- Perform dry-run data verification and final security smoke test.
