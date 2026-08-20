import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBank } from "../quiz-engine.js";

const root = (() => {
  const i = process.argv.indexOf("--root");
  if (i < 0) return join(dirname(fileURLToPath(import.meta.url)), "..");
  const p = process.argv[i + 1];
  if (!p) {
    console.error("--root requires a path");
    process.exit(1);
  }
  return p;
})();
const min = (() => {
  const i = process.argv.indexOf("--min");
  if (i < 0) return 0;
  const raw = process.argv[i + 1];
  if (raw === undefined) {
    console.error("--min requires a value");
    process.exit(1);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error("--min must be a finite number >= 0");
    process.exit(1);
  }
  return n;
})();

const index = JSON.parse(await readFile(join(root, "data/index.json"), "utf8"));
const raw = [];
for (const file of index.files) {
  const arr = JSON.parse(await readFile(join(root, "data", file), "utf8"));
  if (!Array.isArray(arr)) {
    console.error(file, "is not an array");
    process.exit(1);
  }
  raw.push(...arr);
}
const { questions, skipped } = normalizeBank(raw);
for (const s of skipped) console.warn("skip", s);
console.log("valid", questions.length, "skipped", skipped.length);
if (skipped.length > 0) {
  console.error(`${skipped.length} invalid or duplicate item(s)`);
  process.exit(1);
}
if (questions.length < min) {
  console.error(`need at least ${min} valid questions`);
  process.exit(1);
}
