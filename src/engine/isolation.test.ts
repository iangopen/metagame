import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The engine is pure TypeScript: it must run in a Node script, a test and (later) a Web Worker.
// tsconfig.engine.json has no DOM lib, so DOM use fails `npm run build`; this test covers what the
// type checker cannot: Math.random (unseeded randomness) and React or DOM imports.

const ROOT = join(import.meta.dirname, ".");

function engineSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return engineSources(path);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("engine isolation", () => {
  const files = engineSources(ROOT);

  it("finds the engine sources", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of files) {
    it(`${file.slice(ROOT.length + 1)}: no Math.random, React or DOM`, () => {
      // Comments may name the banned things (rng.ts says "Math.random is banned"); code may not.
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/Math\.random/);
      expect(code).not.toMatch(/from\s+["'](react|react-dom)/);
      expect(code).not.toMatch(/\b(document|window|navigator|localStorage)\s*\./);
    });
  }
});
