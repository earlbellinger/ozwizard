import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
let sourceCommit = "unknown";
try {
  sourceCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  }).trim();
} catch {}

const define = {
  __OZWIZARD_VERSION__: JSON.stringify(packageJson.version),
  __OZWIZARD_COMMIT__: JSON.stringify(sourceCommit)
};

const rawPackageFilesPlugin = {
  name: "raw-package-files",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^dejavu-fonts-ttf\/LICENSE\?raw$/ }, () => ({
      path: fileURLToPath(new URL("../node_modules/dejavu-fonts-ttf/LICENSE", import.meta.url)),
      namespace: "raw-package-file"
    }));
    buildContext.onLoad({ filter: /.*/, namespace: "raw-package-file" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text"
    }));
  }
};

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  legalComments: "none",
  outfile: "dist/assets/wizard_of_oz-file.js",
  loader: { ".py": "text", ".ttf": "dataurl" },
  plugins: [rawPackageFilesPlugin],
  define
});

await build({
  entryPoints: ["src/gridWorker.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  legalComments: "none",
  outfile: "dist/assets/grid-worker-file.js",
  define
});

for (const output of ["dist/assets/wizard_of_oz-file.js", "dist/assets/grid-worker-file.js"]) {
  const source = await readFile(output, "utf8");
  await writeFile(output, source.replace(/[ \t]+$/gm, ""), "utf8");
}
