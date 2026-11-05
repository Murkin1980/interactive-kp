# Cloudflare Access Deployment Runbook: Interactive KP

This runbook documents the configuration and rollout steps required to switch manager authentication for Interactive KP from legacy Supabase Auth to Cloudflare Access + MiniBase.

---

## 1. Architecture & Defense-in-Depth

```
[ Browser / Manager ] 
       │
       ▼
[ Cloudflare Zero Trust (Access Perimeter) ] 
       │  • Evaluates identity (Google Workspace, IdP, One-Time PIN)
       │  • Injects signed header: `Cf-Access-Jwt-Assertion`
       ▼
[ OpenNext / Cloudflare Worker (`interactive-kp`) ]
       │  • `src/lib/auth/manager-session.ts` (Server boundary)
       │  • Fetches Cloudflare JWKS from `${CLOUDFLARE_ACCESS_ISSUER}/cdn-cgi/access/certs`
       │  • Verifies cryptographic signature, issuer, and audience
       │  • Extracts verified `payload.email`
       │  • Validates and maps email -> persistent manager UUID via `CLOUDFLARE_ACCESS_MANAGER_MAP`
       ▼
[ MiniBase Server Client ]
       • Operates strictly on `clients_<uuid>` and `proposals_<uuid>` partitions
       • Zero browser credentials, zero MiniBase secrets exposed
```

### Perimeter vs. Application Authorization
- **Perimeter Bypass is NOT client authorization**: Cloudflare Access `Bypass` policies simply permit HTTP traffic to reach the Worker without an employee IdP login.
- **Application-tier authorization**: Client proposal access (`/public/<token>`) is governed strictly by the proposal's unguessable public token, expiration status (`is_expired`), and lifecycle locking (`status === 'confirmed'`). Client routes NEVER invoke private manager API routes (`/api/*`).

---

## 2. Route Map: Public vs. Private

| Route Pattern | Access Level | Protection Mechanism |
| :--- | :--- | :--- |
| `/public/[token]` | **Public (Client)** | Perimeter Bypass. App-tier token validation, expiration check, status lock. |
| `/_next/static/*` | **Public (Assets)** | Perimeter Bypass. Read-only static JS/CSS assets. |
| `/favicon.ico` | **Public (Asset)** | Perimeter Bypass. Static icon. |
| `/login` | **Public (Info)** | Informational landing page. Directs managers to Cloudflare Access gateway. |
| `/auth/callback` | **Public (Redirect)**| Legacy OAuth handler. Sanitizes and redirects cleanly to `/dashboard`. |
| `/dashboard` | **Private (Manager)**| Perimeter Access Policy (`Allow`). |
| `/clients`, `/clients/*` | **Private (Manager)**| Perimeter Access Policy (`Allow`). |
| `/proposals`, `/proposals/*` | **Private (Manager)**| Perimeter Access Policy (`Allow`). |
| `/settings` | **Private (Manager)**| Perimeter Access Policy (`Allow`). |
| `/api/clients/*` | **Private API** | Server-side `requireManagerId()` (verifies signed JWT, checks manager map). |
| `/api/proposals/*` | **Private API** | Server-side `requireManagerId()` (verifies signed JWT, checks manager map). |
| `/api/proposal-items/*` | **Private API** | Server-side `requireManagerId()` (verifies signed JWT, checks manager map). |

---

## 3. Worker Secrets & Environment Configuration

The following environment secrets must be configured in Cloudflare Workers for the `interactive-kp` service:

| Secret | Description | Validation Rule | Example |
| :--- | :--- | :--- | :--- |
| `CLOUDFLARE_ACCESS_ISSUER` | Team domain URL | HTTPS, ending with `.cloudflareaccess.com` | `https://salamat-mebel.cloudflareaccess.com` |
| `CLOUDFLARE_ACCESS_AUD` | Application AUD tag | 64-character hex string | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| `CLOUDFLARE_ACCESS_MANAGER_MAP` | JSON email-to-UUID map | Valid JSON object, unique emails, RFC 4122 UUID values | `{"manager@salamat-mebel.kz":"550e8400-e29b-41d4-a716-446655440000"}` |

### Setting secrets via Wrangler CLI

```bash
wrangler secret put CLOUDFLARE_ACCESS_ISSUER
# Prompt: https://<team-name>.cloudflareaccess.com

wrangler secret put CLOUDFLARE_ACCESS_AUD
# Prompt: <application-aud>

wrangler secret put CLOUDFLARE_ACCESS_MANAGER_MAP
# Prompt: {"manager@salamat-mebel.kz":"<manager-uuid>"}
```

> [!IMPORTANT]
> The manager UUID in `CLOUDFLARE_ACCESS_MANAGER_MAP` must match the existing manager ID previously stored in MiniBase (`clients_<uuid>`, `proposals_<uuid>`). Duplicate emails, malformed JSON, and invalid UUIDs are strictly rejected by `parseManagerMap()` as `ManagerConfigurationError` (HTTP 500 without leaking secrets).

---

## 4. Cloudflare Zero Trust Application Setup

1. In the **Cloudflare Zero Trust Dashboard**, navigate to **Access** -> **Applications**.
2. Click **Add an application** -> **Self-hosted**.
3. Configure **Application Settings**:
   - **Application name**: `Interactive KP Studio`
   - **Session Duration**: `24 hours`
   - **Application domain**: `kp.salamat-mebel.kz`
4. Configure **Policies** (order matters):
   - **Policy 1: Bypass Public Proposal View**
     - Action: `Bypass`
     - Rule type: Include -> `Path is` -> `/public/*`
   - **Policy 2: Bypass Static Assets**
     - Action: `Bypass`
     - Rule type: Include -> `Path is` -> `/_next/static/*`
   - **Policy 3: Bypass Favicon**
     - Action: `Bypass`
     - Rule type: Include -> `Path is` -> `/favicon.ico`
   - **Policy 4: Allow Managers**
     - Action: `Allow`
     - Rule type: Include -> `Emails` or `Emails ending in` (e.g. `@salamat-mebel.kz`)
5. Save Application and copy the **Application AUD** from the overview page into `CLOUDFLARE_ACCESS_AUD`.

---

## 5. Verification & Smoke Testing Checklist

1. **Manager Access**:
   - Navigate to `https://kp.salamat-mebel.kz/login` -> click "Перейти в рабочий кабинет".
   - Verify that Cloudflare Access authenticates the user and forwards the request.
   - Verify that `/dashboard`, `/clients`, `/proposals` load existing data correctly.
2. **Defense-in-Depth & API Protection**:
   - Direct API request without `Cf-Access-Jwt-Assertion` returns HTTP `401 Unauthorized`.
   - Request with JWT from an email not in `CLOUDFLARE_ACCESS_MANAGER_MAP` returns HTTP `403 Forbidden`.
   - Tampered JWT signature or expired token returns HTTP `401 Unauthorized`.
3. **Public Proposal View**:
   - Open a client link: `https://kp.salamat-mebel.kz/public/<token>`.
   - Confirm that Cloudflare Access does **not** prompt for employee login.
   - Confirm client can inspect item variants and options without access to manager routes.
4. **Session Termination**:
   - Clicking "Выход" in the sidebar opens the session modal with direct links to `/cdn-cgi/access/logout` and `/login`.
