# Interactive KP — mandatory project rituals

Read this file and `SESSION_NOTES.md` before changing or deploying the project.

## Start-of-work checks

1. Run `git status --short` and preserve unrelated user changes.
2. Confirm the active branch and remote before committing or deploying.
3. Inspect `package.json`, `wrangler.jsonc`, `.env.example`, and the latest Supabase migrations before changing infrastructure.
4. Never print, commit, or paste `.env.local`, `.dev.vars`, OAuth secrets, service-role keys, or Wrangler OAuth tokens.

## Cloudflare and OpenNext

- Production builds MUST use `next build --webpack`. Turbopack builds have produced runtime `ChunkLoadError: Failed to load chunk server/chunks/ssr/...` on OpenNext/Workers.
- Do not deploy OpenNext from the OneDrive workspace or another path containing Cyrillic/spaces when a clean deployment is required. Build from a fresh ASCII-only clone such as `C:\tmp\interactive-kp-cloud-deploy`.
- In the clean clone, copy `.env.local` and `.dev.vars` only for the build, never add them to Git, install from the committed lockfile, then run the deployment.
- Next.js 16 Node `proxy.ts` is incompatible with the current OpenNext Cloudflare adapter. Keep route protection in `AuthBoundary`; authorization of data remains enforced by Supabase RLS.
- Existing production Worker: `interactive-kp`.
- Existing custom domain: `kp.salamat-mebel.kz`.
- Existing cache bucket: `interactive-kp-opennext-cache`.
- Do not create a second Worker, Pages project, R2 bucket, or domain unless the user explicitly asks for a separate environment.

## Required deployment sequence

1. Run `npm.cmd run lint`.
2. Run `npm.cmd run build` and confirm Webpack is shown in the output.
3. Commit and push the exact source state.
4. Make or update a clean ASCII-only clone outside OneDrive.
5. Deploy from that clean clone with the existing Cloudflare account and `--keep-vars` workflow.
6. Confirm Wrangler reports the expected Worker, custom domain, bindings, and a new version ID.
7. Smoke-test both `/login` and a real `/public/<token>` URL. HTTP 200 alone is not enough: also render the page in a browser.
8. Test desktop and mobile layouts, image loading, Supabase requests, Google login redirect, and PDF controls.
9. If the Worker returns 500, inspect `wrangler tail` before trying a different architecture. Clean up tail processes and temporary log files afterward.

## Supabase and authentication

- Google OAuth production callback in the application is `https://kp.salamat-mebel.kz/auth/callback`.
- The Google provider callback remains `https://rbgfrqjmejslreyuwzxk.supabase.co/auth/v1/callback`.
- When a new OAuth identity appears empty, inspect `auth.users`, organization membership, `owner_id`, and `organization_id` before assuming data was lost.
- Do not weaken RLS to fix missing data. Link the correct user to the existing organization and verify client/KP counts.
- Confirmed KP rows are protected by `kp_lock_trigger`. For a one-time ownership migration, use a single transaction, disable only that named trigger briefly, re-enable it before commit, and verify its final state is `O`.
- After database security changes, run Supabase advisors and verify the exact query or browser flow.

## Product verification

- Public KP must preserve visualization, dimension sketch, variants, options, totals, confirmation, and PDF generation.
- A previously generated confirmed PDF is immutable. Regenerate only through the explicit reopen/reconfirm workflow.
- WhatsApp and client links must use the deployed origin, never `127.0.0.1`.
- Record tutorial videos only after the production domain and UI are stable. Prepare separate manager and client scripts/prompts.
