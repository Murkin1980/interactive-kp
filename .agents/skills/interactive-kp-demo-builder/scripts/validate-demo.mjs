import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const file = process.argv[2];
if (!file) throw new Error("Pass a demo.json path.");
const absolute = resolve(file);
const demo = JSON.parse(readFileSync(absolute, "utf8"));
const fail = (message) => { throw new Error(`${absolute}: ${message}`); };

if (!/^[a-z0-9-]+$/.test(demo.slug ?? "")) fail("invalid slug");
for (const key of ["title", "description", "duration"]) if (!demo[key]) fail(`missing ${key}`);
if (!Array.isArray(demo.steps) || demo.steps.length < 2) fail("steps must contain at least two items");

demo.steps.forEach((step, index) => {
  for (const key of ["image", "title", "description"]) if (!step[key]) fail(`step ${index + 1} missing ${key}`);
  const imagePath = resolve(dirname(absolute), step.image.split("/").at(-1));
  if (!existsSync(imagePath)) fail(`step ${index + 1} image does not exist: ${imagePath}`);
  if (!step.hotspot) return;
  for (const key of ["x", "y", "width", "height"]) {
    const value = step.hotspot[key];
    if (!Number.isFinite(value) || value < 0 || value > 100) fail(`step ${index + 1} invalid hotspot.${key}`);
  }
  if (step.hotspot.x + step.hotspot.width > 100 || step.hotspot.y + step.hotspot.height > 100) fail(`step ${index + 1} hotspot exceeds image`);
  if (!step.hotspot.label) fail(`step ${index + 1} hotspot missing label`);
  if (step.hotspot.next !== undefined && (!Number.isInteger(step.hotspot.next) || step.hotspot.next < 0 || step.hotspot.next >= demo.steps.length)) fail(`step ${index + 1} invalid hotspot.next`);
});

console.log(`Valid demo: ${demo.title} (${demo.steps.length} steps)`);
