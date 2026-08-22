// Headless 10-question session using the same quiz engine as the UI.
// Usage: node scripts/simulate-session.mjs
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SESSION_SIZE,
  STORAGE_KEY,
  normalizeBank,
  filterPool,
  pickSession,
  loadProgress,
  saveProgress,
  recordAnswer,
} from "../quiz-engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

function matchesFilter(q, sourceFilter) {
  if (sourceFilter === "mixed") return true;
  return q.source === sourceFilter || q.source === "both";
}

async function loadBank() {
  const index = JSON.parse(await readFile(join(root, "data/index.json"), "utf8"));
  const raw = [];
  for (const file of index.files) {
    const arr = JSON.parse(await readFile(join(root, "data", file), "utf8"));
    raw.push(...arr);
  }
  const { questions, skipped } = normalizeBank(raw);
  if (skipped.length) {
    console.error(`${skipped.length} invalid or duplicate item(s)`);
    process.exit(1);
  }
  return questions;
}

function runSession(questions, sourceFilter, storage, random) {
  const pool = filterPool(questions, sourceFilter);
  if (pool.length < SESSION_SIZE) {
    throw new Error(`${sourceFilter}: pool too small (${pool.length})`);
  }

  let progress = loadProgress(storage);
  const session = pickSession(pool, progress.questions, SESSION_SIZE, random);

  if (session.length !== SESSION_SIZE) {
    throw new Error(`${sourceFilter}: expected ${SESSION_SIZE} questions, got ${session.length}`);
  }
  for (const q of session) {
    if (!matchesFilter(q, sourceFilter)) {
      throw new Error(`${sourceFilter}: question ${q.id} has source ${q.source}`);
    }
  }

  progress = { ...progress, lastSource: sourceFilter };
  saveProgress(storage, progress);

  let score = 0;
  const misses = [];
  const now = Date.now();

  for (let i = 0; i < session.length; i++) {
    const q = session[i];
    const correct = i % 2 === 0;
    const chosen = correct ? q.answerIndex : (q.answerIndex + 1) % q.choices.length;
    if (correct) score += 1;
    else misses.push(q.id);
    progress = recordAnswer(progress, q.id, correct, now + i);
    saveProgress(storage, progress);
    if (chosen === q.answerIndex !== correct) {
      throw new Error(`${sourceFilter}: answer logic bug on ${q.id}`);
    }
  }

  progress = { ...progress, lastScore: score };
  saveProgress(storage, progress);

  return { score, misses, sessionIds: session.map((q) => q.id) };
}

const questions = await loadBank();
console.log(`bank: ${questions.length} questions`);

const filters = ["nasm", "nsca", "mixed"];
let seed = 0.42;
const random = () => {
  seed = (seed * 16807) % 1;
  return seed;
};

for (const sourceFilter of filters) {
  const storage = createMemoryStorage();
  const { score, misses, sessionIds } = runSession(questions, sourceFilter, storage, random);
  console.log(
    `${sourceFilter}: score ${score}/${SESSION_SIZE} misses [${misses.join(", ")}] ids [${sessionIds.join(", ")}]`,
  );

  const saved = loadProgress(storage);
  if (saved.lastScore !== score) {
    throw new Error(`${sourceFilter}: lastScore mismatch`);
  }
  if (saved.lastSource !== sourceFilter) {
    throw new Error(`${sourceFilter}: lastSource mismatch`);
  }
  if (storage.getItem(STORAGE_KEY) === null) {
    throw new Error(`${sourceFilter}: progress not persisted`);
  }
}

console.log("simulate-session: ok");
