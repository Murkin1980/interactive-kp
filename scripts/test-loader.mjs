import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveCandidate(basePath) {
  for (const candidate of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
  ]) {
    if (isFile(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export {};",
        shortCircuit: true,
      };
    }

    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier === "next/headers") {
      return nextResolve("next/headers.js", context);
    }

    if (specifier.startsWith("@/")) {
      const resolved = resolveCandidate(join(root, "src", specifier.slice(2)));
      if (resolved) {
        return { url: resolved, shortCircuit: true };
      }
    }

    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const parentDir = new URL(".", context.parentURL);
      const basePath = new URL(specifier, parentDir);
      if (basePath.protocol === "file:") {
        const fsPath = decodeURIComponent(basePath.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
        const resolved = resolveCandidate(fsPath);
        if (resolved) {
          return { url: resolved, shortCircuit: true };
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
