---
name: interactive-kp-demo-builder
description: Create, update, capture, validate, and publish self-hosted interactive product walkthroughs for the Interactive KP project. Use for tutorial demos, onboarding instructions, screenshot-based click-through guides, Demo Hub additions, or replacing LiveDemo recordings in the interactive-kp repository.
---

# Interactive KP Demo Builder

## Workflow

1. Read the repository `AGENTS.md` and preserve unrelated changes.
2. Select one bounded user journey with 3–7 meaningful steps. Prefer read-only or disposable test data.
3. Capture screens at 1440×900 with the project command:
   `npm run demo:capture -- <trusted-url> <slug> <scrollY...>`.
4. Store screenshots and `demo.json` in `public/demos/<slug>/`.
5. Add a card to `src/app/demo/page.tsx` and a route using `DemoPlayer`.
6. Validate the definition with `node .agents/skills/interactive-kp-demo-builder/scripts/validate-demo.mjs public/demos/<slug>/demo.json`.
7. Run lint and the Webpack production build. Test `/demo` and the new scenario on desktop and mobile.
8. Follow the repository's required Cloudflare deployment sequence.

## Authoring rules

- Use real application screenshots; never include passwords, tokens, private phone numbers, or unrelated client data.
- Write one action or learning point per step.
- Place hotspots using percentages relative to the 1440×900 screenshot.
- Keep hotspots large enough to tap, but tightly aligned to the intended control.
- Give every hotspot a clear Russian `label` for accessibility.
- Keep the final step useful without requiring a click.
- Do not depend on a third-party demo SaaS at runtime.

Read [references/demo-format.md](references/demo-format.md) when creating or changing `demo.json`.

## Verification

- Confirm every referenced screenshot exists.
- Click every hotspot and verify its target step.
- Verify keyboard Left/Right/Escape behavior.
- Verify no authenticated app route is exposed by the demo.
- Close all browser automation sessions after capture.
