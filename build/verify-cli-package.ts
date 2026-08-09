import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};
const scratch = await mkdtemp(join(tmpdir(), "decimen-cli-verification-"));
const packageDirectory = join(scratch, "package");
const consumerDirectory = join(scratch, "consumer");
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "run this verifier through npm so npm_execpath identifies the package manager");
const commandOptions = {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
  maxBuffer: 2 * 1024 * 1024,
};

try {
  await mkdir(packageDirectory);
  await mkdir(consumerDirectory);
  await execFile(process.execPath, [npmCli, "pack", "--pack-destination", packageDirectory], commandOptions);
  const archives = (await readdir(packageDirectory)).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1, `expected one package archive, found ${archives.join(", ")}`);
  const archive = join(packageDirectory, archives[0]!);

  await execFile(
    process.execPath,
    [npmCli, "install", "--prefix", consumerDirectory, "--no-audit", "--no-fund", archive],
    commandOptions,
  );
  const installedRoot = join(consumerDirectory, "node_modules", packageJson.name);
  const installedPackage = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8")) as {
    version: string;
  };
  assert.equal(installedPackage.version, packageJson.version);
  assert.ok(
    !(await readdir(installedRoot)).includes("cli"),
    "the install should contain the standalone bundle, not TypeScript source",
  );

  const executable = join(installedRoot, "dist-cli", "decimen.js");
  const bin = join(
    consumerDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "decimen.cmd" : "decimen",
  );
  assert.ok((await stat(bin)).isFile(), "npm must expose the declared decimen command");
  const version = await execFile(process.execPath, [executable, "--version"], commandOptions);
  assert.equal(version.stdout.trim(), packageJson.version);
  if (process.platform !== "win32") {
    const linkedVersion = await execFile(bin, ["--version"], commandOptions);
    assert.equal(linkedVersion.stdout.trim(), packageJson.version, "the installed bin must be executable");
  }

  const dryRun = await execFile(
    process.execPath,
    [executable, "text", "fresh package test", "--session", "42", "--dry-run", "--json"],
    commandOptions,
  );
  const plan = JSON.parse(dryRun.stdout) as {
    name: string;
    sessionId: number;
    sourceBlocks: number;
    qr: { columns: number; rows: number };
  };
  assert.equal(plan.name, "snippet.txt");
  assert.equal(plan.sessionId, 42);
  assert.ok(plan.sourceBlocks >= 1);
  assert.ok(plan.qr.columns > 0 && plan.qr.rows > 0);

  const rendered = await execFile(
    process.execPath,
    [executable, "text", "fresh package frame", "--session", "42", "--frames", "1", "--force"],
    commandOptions,
  );
  assert.match(rendered.stdout, /Frame 1/);
  assert.match(rendered.stdout, /\u001b\[/);
  assert.match(rendered.stdout, /caoshurong\.github\.io\/decimen-optical-transfer\/receive/);

  process.stdout.write(
    `Verified ${archives[0]}: fresh install, version, dry run, and one real terminal frame.\n`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
