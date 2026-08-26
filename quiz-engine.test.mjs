import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  SESSION_SIZE,
  validateQuestion,
  normalizeBank,
  filterPool,
  pickSession,
  pickMixedSession,
  loadProgress,
  saveProgress,
  recordAnswer,
  emptyProgress,
} from "./quiz-engine.js";

const mcq = (over = {}) => ({
  id: "nasm-opt-001",
  source: "nasm",
  type: "mcq",
  topic: "OPT Phase 2",
  question: "What is the hypertrophy set range in OPT Phase 2?",
  choices: ["1–3", "4–6", "8–12", "20+"],
  answerIndex: 2,
  explanation: "Phase 2 uses moderate loads and 8–12 reps for hypertrophy adaptations.",
  ...over,
});

test("constants", () => {
  assert.equal(STORAGE_KEY, "ptDrill.v1");
  assert.equal(SESSION_SIZE, 10);
});

test("validateQuestion rejects bad answerIndex", () => {
  const seen = new Set();
  const r = validateQuestion(mcq({ answerIndex: 4 }), seen);
  assert.equal(r.ok, false);
});

test("validateQuestion tf requires 2 choices", () => {
  const seen = new Set();
  const r = validateQuestion(
    mcq({
      id: "nasm-tf-001",
      type: "tf",
      choices: ["True", "False"],
      answerIndex: 0,
    }),
    seen
  );
  assert.equal(r.ok, true);
});

test("normalizeBank drops duplicates keeping first", () => {
  const { questions, skipped } = normalizeBank([
    mcq({ id: "a" }),
    mcq({ id: "a", question: "dup" }),
  ]);
  assert.equal(questions.length, 1);
  assert.equal(skipped.length, 1);
});

test("filterPool nasm includes both", () => {
  const qs = [
    mcq({ id: "1", source: "nasm" }),
    mcq({ id: "2", source: "nsca" }),
    mcq({ id: "3", source: "both" }),
  ];
  const pool = filterPool(qs, "nasm").map((q) => q.id);
  assert.deepEqual(pool.sort(), ["1", "3"]);
});

test("exercise questions require an image and appear in mixed mode", () => {
  const exercise = mcq({
    id: "exercise-squat",
    source: "exercises",
    topic: "Exercise identification",
    question: "Which exercise is shown?",
    image: "./data/exercise-images/squat.png",
  });
  assert.equal(validateQuestion(exercise, new Set()).ok, true);
  assert.equal(validateQuestion({ ...exercise, image: "" }, new Set()).ok, false);
  assert.deepEqual(filterPool([exercise, mcq()], "mixed").map((q) => q.id), [
    "exercise-squat",
    "nasm-opt-001",
  ]);
  assert.deepEqual(filterPool([exercise, mcq(), mcq({ id: "shared", source: "both" })], "exercises").map((q) => q.id), ["exercise-squat"]);
});

test("equipment questions require an image and can be filtered", () => {
  const equipment = mcq({
    id: "equipment-barbell",
    source: "equipment",
    topic: "Gym equipment identification",
    question: "Which piece of gym equipment is shown?",
    image: "./data/gym-equipment/barbell.jpg",
  });
  assert.equal(validateQuestion(equipment, new Set()).ok, true);
  assert.equal(validateQuestion({ ...equipment, image: "" }, new Set()).ok, false);
  assert.deepEqual(filterPool([equipment, mcq()], "equipment").map((q) => q.id), ["equipment-barbell"]);
});

test("pickMixedSession represents every category", () => {
  const make = (source, index) => mcq({
    id: `${source}-${index}`,
    source,
    image: ["exercises", "muscles", "equipment"].includes(source) ? `${source}-${index}.png` : undefined,
  });
  const bank = ["nasm", "nsca", "exercises", "muscles", "equipment"].flatMap((source) =>
    Array.from({ length: 4 }, (_, index) => make(source, index))
  );
  const picked = pickMixedSession(bank, {}, 10, () => 0.5);
  const counts = Object.groupBy
    ? Object.fromEntries(Object.entries(Object.groupBy(picked, (q) => q.source)).map(([k, v]) => [k, v.length]))
    : picked.reduce((all, q) => ({ ...all, [q.source]: (all[q.source] || 0) + 1 }), {});
  assert.deepEqual(counts, { nasm: 2, nsca: 2, exercises: 2, muscles: 2, equipment: 2 });
});

test("pickSession prefers unseen then previously wrong", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7].map((n) => mcq({ id: String(n) }));
  const stats = {
    "1": { seen: 2, wrong: 0, lastSeen: 100 },
    "2": { seen: 2, wrong: 1, lastSeen: 50 },
    "3": { seen: 1, wrong: 0, lastSeen: 90 },
    "4": { seen: 1, wrong: 0, lastSeen: 80 },
    "5": { seen: 1, wrong: 0, lastSeen: 70 },
    "6": { seen: 1, wrong: 0, lastSeen: 60 },
  };
  const picked = pickSession(pool, stats, 6, () => 0.99);
  assert.equal(picked.length, 6);
  assert.deepEqual(
    picked.map((q) => q.id),
    ["7", "2", "6", "5", "4", "3"]
  );
});

test("loadProgress wipes corrupt json", () => {
  const storage = { getItem: () => "{", setItem() {}, removeItem() {} };
  const p = loadProgress(storage);
  assert.equal(p.lastScore, null);
  assert.deepEqual(p.questions, {});
});

test("loadProgress wipes parseable but invalid progress", () => {
  const cases = [
    { lastScore: null, lastSource: null, questions: null },
    { lastScore: null, lastSource: null, questions: [] },
    { lastScore: 11, lastSource: "nasm", questions: {} },
    { lastScore: 4, lastSource: "bogus", questions: {} },
    {
      lastScore: 4,
      lastSource: "nasm",
      questions: { a: { seen: "1", wrong: 0, lastSeen: 10 } },
    },
  ];
  for (const invalid of cases) {
    let removed = false;
    const storage = {
      getItem: () => JSON.stringify(invalid),
      setItem() {},
      removeItem: () => {
        removed = true;
      },
    };
    const p = loadProgress(storage);
    assert.equal(removed, true, JSON.stringify(invalid));
    assert.deepEqual(p, emptyProgress(), JSON.stringify(invalid));
  }
});

test("loadProgress accepts valid persisted progress", () => {
  const valid = {
    lastScore: 4,
    lastSource: "mixed",
    questions: { a: { seen: 2, wrong: 1, lastSeen: 100 } },
  };
  const storage = {
    getItem: () => JSON.stringify(valid),
    setItem() {},
    removeItem() {
      assert.fail("should not wipe valid progress");
    },
  };
  assert.deepEqual(loadProgress(storage), valid);
});

test("recordAnswer increments wrong only when incorrect", () => {
  let p = emptyProgress();
  p = recordAnswer(p, "a", false, 10);
  p = recordAnswer(p, "a", true, 20);
  assert.equal(p.questions.a.seen, 2);
  assert.equal(p.questions.a.wrong, 1);
  assert.equal(p.questions.a.lastSeen, 20);
});

test("saveProgress roundtrip", () => {
  const mem = {};
  const storage = {
    getItem: (k) => mem[k] ?? null,
    setItem: (k, v) => {
      mem[k] = v;
    },
  };
  const p = emptyProgress();
  p.lastScore = 4;
  p.lastSource = "nasm";
  saveProgress(storage, p);
  assert.equal(JSON.parse(mem[STORAGE_KEY]).lastScore, 4);
});
