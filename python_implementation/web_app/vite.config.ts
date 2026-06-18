import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
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
