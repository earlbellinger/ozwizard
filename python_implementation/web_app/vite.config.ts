import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const packageVersion = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")).version as string;
let sourceCommit = "unknown";
try {
  sourceCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim();
} catch {}

export default defineConfig({
  root: ".",
  base: "./",
  define: {
    __OZWIZARD_VERSION__: JSON.stringify(packageVersion),
    __OZWIZARD_COMMIT__: JSON.stringify(sourceCommit)
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "wizard_of_oz.html")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"]
  }
});
