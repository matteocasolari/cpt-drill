import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)));
const validator = join(repoRoot, "scripts/validate-bank.mjs");

const fixture = {
  id: "nasm-opt-001",
  source: "nasm",
  type: "mcq",
  topic: "OPT Phase 1",
  question: "What is the primary focus of OPT Phase 1?",
  choices: ["Max strength", "Endurance and efficiency", "Power", "Speed"],
  answerIndex: 1,
  explanation: "Phase 1 emphasizes endurance and neuromuscular efficiency.",
};

function runValidator(root, min) {
  return spawnSync(process.execPath, [validator, "--root", root, "--min", String(min)], {
    encoding: "utf8",
  });
}

async function writeTempBank(items) {
  const dir = await mkdtemp(join(tmpdir(), "cpt-drill-validate-"));
  const dataDir = join(dir, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "index.json"), JSON.stringify({ files: ["bank.json"] }));
  await writeFile(join(dataDir, "bank.json"), JSON.stringify(items));
  return dir;
}

test("validate-bank exits 1 for duplicate ids in temp bank without touching tracked data", async () => {
  const trackedBefore = await readFile(join(repoRoot, "data/nasm-opt.json"), "utf8");
  const items = Array.from({ length: 6 }, (_, i) => ({
    ...fixture,
    id: `dup-test-${i + 1}`,
  }));
  items.push({ ...fixture, id: "dup-test-1", question: "duplicate" });
  const dir = await writeTempBank(items);
  const result = runValidator(dir, 6);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /skipped 1/);
  assert.match(result.stderr, /invalid or duplicate/);
  const trackedAfter = await readFile(join(repoRoot, "data/nasm-opt.json"), "utf8");
  assert.equal(trackedAfter, trackedBefore);
});

test("validate-bank exits 1 for malformed item even when valid count meets --min", async () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    ...fixture,
    id: `bad-test-${i + 1}`,
  }));
  items.push({ ...fixture, id: "bad-test-7", answerIndex: 99 });
  const dir = await writeTempBank(items);
  const result = runValidator(dir, 6);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /valid 6 skipped 1/);
});
