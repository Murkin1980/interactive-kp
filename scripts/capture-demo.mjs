import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const [url, slug, ...scrollValues] = process.argv.slice(2);
if (!url || !slug) {
  console.error("Usage: npm run demo:capture -- <url> <slug> [scrollY ...]");
  process.exit(1);
}

const parsed = new URL(url);
const allowedHosts = new Set(["kp.salamat-mebel.kz", "127.0.0.1", "localhost"]);
if (!allowedHosts.has(parsed.hostname)) {
  console.error(`Refusing to capture untrusted host: ${parsed.hostname}`);
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("Slug may contain only lowercase letters, digits and hyphens.");
  process.exit(1);
}

const outputDir = resolve("public", "demos", slug);
mkdirSync(outputDir, { recursive: true });
const scrolls = scrollValues.length ? scrollValues.map(Number) : [0];
if (scrolls.some((value) => !Number.isFinite(value) || value < 0)) {
  console.error("Every scrollY value must be a non-negative number.");
  process.exit(1);
}

const session = `demo-${slug}-${Date.now()}`;
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (...args) => {
  const result = spawnSync(command, ["--yes", "agent-browser", "--session", session, ...args], {
    cwd: process.platform === "win32" ? "C:\\tmp" : "/tmp",
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`agent-browser failed: ${args.join(" ")}`);
};

try {
  run("open", url);
  run("set", "viewport", "1440", "900");
  run("wait", "2500");
  let previous = 0;
  for (let index = 0; index < scrolls.length; index += 1) {
    const target = scrolls[index];
    const delta = target - previous;
    if (delta > 0) run("scroll", "down", String(delta));
    if (delta < 0) run("scroll", "up", String(Math.abs(delta)));
    if (delta !== 0) run("wait", "400");
    const name = `${String(index + 1).padStart(2, "0")}.png`;
    run("screenshot", resolve(outputDir, name));
    previous = target;
  }
  console.log(`Captured ${scrolls.length} step(s) in ${outputDir}`);
} finally {
  try { run("close"); } catch { /* best-effort cleanup */ }
}
