import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../dist-cli/", import.meta.url));
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../cli/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist-cli/decimen.js", import.meta.url)),
  absWorkingDir: root,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  treeShaking: true,
  legalComments: "eof",
  banner: { js: "#!/usr/bin/env node" },
  define: { __DECIMEN_VERSION__: JSON.stringify(packageJson.version) },
});
await chmod(new URL("../dist-cli/decimen.js", import.meta.url), 0o755);
