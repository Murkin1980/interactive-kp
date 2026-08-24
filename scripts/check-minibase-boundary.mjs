import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const forbiddenSecret = /(?:mb_secret_|MINIBASE_SECRET_KEY)/;
const clientDirective = /^\s*["']use client["'];?/m;
const findings = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    if (clientDirective.test(source) && forbiddenSecret.test(source)) {
      findings.push(relative(root, path));
    }
  }
}

await visit(sourceRoot);

if (findings.length) {
  console.error("MiniBase server secret referenced by client code:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("MiniBase browser-secret boundary: PASS");
