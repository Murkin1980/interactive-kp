/**
 * Batch recording script for all 13 demo videos.
 *
 * Prerequisites:
 * 1. App running locally: npm run dev
 * 2. Auth state: npx testreel login --channel chrome
 * 3. testreel: npm install --save-dev testreel
 *
 * Usage:
 *   node demo/scripts/record.mjs              # record all
 *   node demo/scripts/record.mjs --only 01    # record only demo 01
 *   node demo/scripts/record.mjs --skip 01    # skip demo 01
 */

import { execSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SCENARIOS_DIR = join(ROOT, "demo", "scenarios");
const OUTPUT_DIR = join(ROOT, "demo", "output");

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const skipIdx = args.indexOf("--skip");
const onlyFilter = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const skipFilter = skipIdx >= 0 ? args[skipIdx + 1] : null;

// Check auth state
const authFile = join("C:\\tmp", "interactive-kp-demo-auth.json");
if (!existsSync(authFile)) {
  console.error("❌ Auth state not found at", authFile);
  console.error("   Run: npx testreel login --channel chrome");
  process.exit(1);
}

// Find scenario files
const files = readdirSync(SCENARIOS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("❌ No scenario files found in", SCENARIOS_DIR);
  process.exit(1);
}

console.log(`\n🎬 Found ${files.length} scenarios\n`);

let recorded = 0;
let skipped = 0;
let failed = 0;

for (const file of files) {
  const scenarioId = file.replace(".json", "");
  const num = scenarioId.split("-")[0];

  // Filter
  if (onlyFilter && !num.startsWith(onlyFilter)) {
    console.log(`⏭️  Skipping ${scenarioId} (--only ${onlyFilter})`);
    skipped++;
    continue;
  }
  if (skipFilter && num.startsWith(skipFilter)) {
    console.log(`⏭️  Skipping ${scenarioId} (--skip ${skipFilter})`);
    skipped++;
    continue;
  }

  const scenarioPath = join(SCENARIOS_DIR, file);
  const webmPath = join(OUTPUT_DIR, `${scenarioId}.webm`);

  // Skip if already recorded
  if (existsSync(webmPath)) {
    const size = statSync(webmPath).size;
    if (size > 10000) {
      console.log(`✅ ${scenarioId}.webm already exists (${(size / 1024 / 1024).toFixed(1)} MB) — skipping`);
      skipped++;
      continue;
    }
  }

  console.log(`\n🎥 Recording ${scenarioId}...`);
  console.log(`   Scenario: ${scenarioPath}`);

  try {
    execSync(
      `npx testreel record "${scenarioPath}" --output "${OUTPUT_DIR}/${scenarioId}.webm"`,
      {
        cwd: ROOT,
        stdio: "inherit",
        timeout: 120_000,
      }
    );
    recorded++;
    console.log(`   ✅ Done: ${scenarioId}.webm`);

    // Brief pause between recordings
    execSync("timeout /t 2 >nul", { shell: true });
  } catch (err) {
    failed++;
    console.error(`   ❌ Failed: ${scenarioId} — ${err.message}`);
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`📊 Results: ${recorded} recorded, ${skipped} skipped, ${failed} failed`);
console.log(`📁 Output: ${OUTPUT_DIR}\n`);

if (failed > 0) {
  process.exit(1);
}
