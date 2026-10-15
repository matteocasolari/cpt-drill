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

test("dedicated nutrition bank contains at least 200 valid questions", async () => {
  const nutrition = JSON.parse(await readFile(join(repoRoot, "data/nutrition.json"), "utf8"));
  assert.ok(nutrition.length >= 200, `expected at least 200 nutrition questions, found ${nutrition.length}`);

  const dir = await writeTempBank(nutrition);
  const result = runValidator(dir, 200);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("exercise technique bank is extensive and covers every required domain", async () => {
  const technique = JSON.parse(await readFile(join(repoRoot, "data/exercise-technique.json"), "utf8"));
  assert.ok(technique.length >= 300, `expected at least 300 exercise technique questions, found ${technique.length}`);
  assert.ok(technique.filter((question) => question.type === "tf").length >= 15, "expected at least 15 true/false misconception checks");

  const dir = await writeTempBank(technique);
  const result = runValidator(dir, 300);
  assert.equal(result.status, 0, result.stderr + result.stdout);

  const topics = technique.map((question) => question.topic.toLowerCase()).join("\n");
  for (const domain of [
    "fundamental technique", "breathing", "spotting", "squat", "deadlift", "lunge", "step-up",
    "bench press", "shoulder press", "row", "pulldown", "pull-up", "chest fly", "lateral raise",
    "biceps curl", "triceps", "leg press", "leg extension", "leg curl", "calf raise", "core",
    "power clean", "snatch", "push press", "machine", "cable", "elastic resistance", "medicine ball",
  ]) {
    assert.match(topics, new RegExp(domain), `missing required technique domain: ${domain}`);
  }

  const fourChoice = technique.filter((question) => question.choices.length === 4);
  const longestKeys = fourChoice.filter((question) => {
    const keyLength = question.choices[question.answerIndex].trim().split(/\s+/).length;
    return question.choices.every((choice, index) => index === question.answerIndex || keyLength >= choice.trim().split(/\s+/).length);
  });
  assert.ok(longestKeys.length / fourChoice.length <= 0.55, "correct choices are too predictably the longest option");

  const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;
  const optionLengths = fourChoice.flatMap((question) => question.choices.map(wordCount));
  const averageOptionLength = optionLengths.reduce((sum, length) => sum + length, 0) / optionLengths.length;
  const sortedOptionLengths = [...optionLengths].sort((a, b) => a - b);
  const optionP90 = sortedOptionLengths[Math.floor((sortedOptionLengths.length - 1) * 0.9)];
  assert.ok(averageOptionLength <= 13, `average option length is ${averageOptionLength.toFixed(1)} words`);
  assert.ok(optionP90 <= 18, `90th-percentile option length is ${optionP90} words`);
  assert.ok(Math.max(...optionLengths) <= 22, "an answer option exceeds 22 words");

  const lowercaseChoices = technique.flatMap((question) =>
    question.choices
      .filter((choice) => /^\p{Ll}/u.test(choice.trim()))
      .map((choice) => `${question.id}: ${choice}`),
  );
  assert.deepEqual(lowercaseChoices, [], "every answer choice should begin with a capital letter");

  const stemLengths = technique.map((question) => wordCount(question.question)).sort((a, b) => a - b);
  const stemP90 = stemLengths[Math.floor((stemLengths.length - 1) * 0.9)];
  assert.ok(stemP90 <= 22, `90th-percentile stem length is ${stemP90} words`);

  const oneSentence = technique.filter((question) => question.explanation.split(/(?<=[.!?])\s+/).filter(Boolean).length < 2);
  assert.deepEqual(oneSentence.map((question) => question.id), [], "every explanation should teach with at least two sentences");

  const bareScenarios = technique.filter((question) => question.type === "scenario" && question.question.split(/(?<=[.!?])\s+/).length < 2);
  assert.deepEqual(bareScenarios.map((question) => question.id), [], "scenario questions should include a setup and an application question");
});

test("exercise technique bank is registered in the manifest", async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, "data/index.json"), "utf8"));
  assert.ok(manifest.files.includes("exercise-technique.json"));
});

test("priority curriculum banks contain the approved expansion totals", async () => {
  const expectedCounts = {
    "nasm-pro.json": 82,
    "nasm-science.json": 96,
    "nasm-assess.json": 98,
    "nasm-flex-cardio.json": 96,
    "nasm-opt.json": 96,
    "nasm-programming.json": 104,
    "nasm-special.json": 88,
    "nsca-consult.json": 91,
    "nsca-resistance.json": 79,
    "nsca-aerobic.json": 72,
    "nsca-plyo-speed.json": 58,
    "nsca-nutrition.json": 45,
    "nsca-conditions.json": 106,
    "both.json": 78,
    "nutrition.json": 222,
  };

  for (const [file, expected] of Object.entries(expectedCounts)) {
    const questions = JSON.parse(await readFile(join(repoRoot, "data", file), "utf8"));
    assert.equal(questions.length, expected, `${file}: expected ${expected}, found ${questions.length}`);
  }
});

test("expanded repository bank has 2,415 valid questions with unique ids", () => {
  const result = runValidator(repoRoot, 2415);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /valid 2415 skipped 0/);
});
