import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
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
  PROGRESS_VERSION,
  MAX_SESSIONS,
  createSessionSummary,
  recordSession,
  calculateAnalytics,
  createBackup,
  parseBackup,
  mergeProgress,
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
  assert.equal(STORAGE_KEY, "cptDrill.v2");
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

test("movement questions require an image and can be filtered", () => {
  const movement = mcq({
    id: "movement-push-up",
    source: "movements",
    topic: "Movement identification",
    question: "Which movement is shown?",
    image: "./data/movements/push-up.png",
  });
  assert.equal(validateQuestion(movement, new Set()).ok, true);
  assert.equal(validateQuestion({ ...movement, image: "" }, new Set()).ok, false);
  assert.deepEqual(filterPool([movement, mcq()], "movements").map((q) => q.id), ["movement-push-up"]);
});

test("nutrition questions validate and can be filtered independently", () => {
  const nutrition = mcq({
    id: "nutrition-001",
    source: "nutrition",
    topic: "Macronutrients",
    question: "Which macronutrient is the body's preferred fuel for strenuous exercise?",
  });
  assert.equal(validateQuestion(nutrition, new Set()).ok, true);
  assert.deepEqual(
    filterPool([nutrition, mcq(), mcq({ id: "shared", source: "both" })], "nutrition").map((q) => q.id),
    ["nutrition-001"],
  );
});

test("pickMixedSession represents every category", () => {
  const make = (source, index) => mcq({
    id: `${source}-${index}`,
    source,
    image: ["exercises", "muscles", "equipment", "movements"].includes(source) ? `${source}-${index}.png` : undefined,
  });
  const bank = ["nasm", "nsca", "nutrition", "exercises", "muscles", "equipment", "movements"].flatMap((source) =>
    Array.from({ length: 4 }, (_, index) => make(source, index))
  );
  const picked = pickMixedSession(bank, {}, 10, () => 0.5);
  const counts = Object.groupBy
    ? Object.fromEntries(Object.entries(Object.groupBy(picked, (q) => q.source)).map(([k, v]) => [k, v.length]))
    : picked.reduce((all, q) => ({ ...all, [q.source]: (all[q.source] || 0) + 1 }), {});
  assert.deepEqual(counts, { nasm: 2, nsca: 2, nutrition: 2, exercises: 1, muscles: 1, equipment: 1, movements: 1 });
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
    assert.equal(p.lastScore, null, JSON.stringify(invalid));
    assert.deepEqual(p.questions, {}, JSON.stringify(invalid));
    assert.deepEqual(p.sessions, [], JSON.stringify(invalid));
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
  const loaded = loadProgress(storage);
  assert.equal(loaded.lastScore, valid.lastScore);
  assert.equal(loaded.lastSource, valid.lastSource);
  assert.deepEqual(loaded.questions, valid.questions);
  assert.equal(loaded.version, 2);
});

test("loadProgress accepts nutrition as the last selected source", () => {
  const valid = { lastScore: 7, lastSource: "nutrition", questions: {} };
  const storage = {
    getItem: () => JSON.stringify(valid),
    setItem() {},
    removeItem() {
      assert.fail("should not wipe valid nutrition progress");
    },
  };
  const loaded = loadProgress(storage);
  assert.equal(loaded.lastScore, valid.lastScore);
  assert.equal(loaded.lastSource, valid.lastSource);
  assert.deepEqual(loaded.questions, {});
});

test("loadProgress migrates the legacy storage key", () => {
  const valid = { lastScore: 4, lastSource: "mixed", questions: {} };
  const memory = { [LEGACY_STORAGE_KEY]: JSON.stringify(valid) };
  const storage = {
    getItem: (key) => memory[key] ?? null,
    setItem: (key, value) => { memory[key] = value; },
    removeItem: (key) => { delete memory[key]; },
  };
  const loaded = loadProgress(storage);
  assert.equal(loaded.lastScore, valid.lastScore);
  assert.equal(loaded.lastSource, valid.lastSource);
  assert.deepEqual(loaded.questions, {});
  assert.equal(memory[LEGACY_STORAGE_KEY], undefined);
  assert.equal(JSON.parse(memory[STORAGE_KEY]).version, 2);
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

test("emptyProgress creates a versioned history container", () => {
  const progress = emptyProgress("dataset-test");
  assert.equal(progress.version, PROGRESS_VERSION);
  assert.equal(progress.datasetId, "dataset-test");
  assert.deepEqual(progress.sessions, []);
});

test("loadProgress migrates v1 progress into v2", () => {
  const old = {
    lastScore: 8,
    lastSource: "nasm",
    questions: { q1: { seen: 2, wrong: 1, lastSeen: 100 } },
  };
  const values = new Map([["cptDrill.v1", JSON.stringify(old)]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const migrated = loadProgress(storage);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.lastScore, 8);
  assert.deepEqual(migrated.questions, old.questions);
  assert.deepEqual(migrated.sessions, []);
  assert.ok(values.has("cptDrill.v2"));
  assert.equal(values.has("cptDrill.v1"), false);
});

test("createSessionSummary groups answered questions and excludes skips", () => {
  const questions = [
    mcq({ id: "q1", source: "nasm", topic: "Assessment" }),
    mcq({ id: "q2", source: "nutrition", topic: "Protein" }),
    mcq({ id: "q3", source: "nasm", topic: "Assessment" }),
  ];
  const summary = createSessionSummary({
    id: "session-1",
    completedAt: 1234,
    mode: "mixed",
    questions,
    responses: [{ chosen: 2, correct: true }, { chosen: 0, correct: false }, null],
  });
  assert.deepEqual(summary, {
    id: "session-1",
    completedAt: 1234,
    mode: "mixed",
    score: 1,
    answered: 2,
    total: 3,
    sources: {
      nasm: { label: "NASM", correct: 1, attempted: 1 },
      nutrition: { label: "Nutrition", correct: 0, attempted: 1 },
    },
    topics: {
      Assessment: { correct: 1, attempted: 1 },
      Protein: { correct: 0, attempted: 1 },
    },
  });
});

test("recordSession deduplicates, sorts, and bounds history", () => {
  let progress = emptyProgress("dataset-test");
  for (let index = MAX_SESSIONS; index >= 0; index -= 1) {
    progress = recordSession(progress, {
      id: `s-${index}`,
      completedAt: index + 1,
      mode: "mixed",
      score: 1,
      answered: 1,
      total: 1,
      sources: { nasm: { label: "NASM", correct: 1, attempted: 1 } },
      topics: { Assessment: { correct: 1, attempted: 1 } },
    });
  }
  progress = recordSession(progress, progress.sessions[0]);
  assert.equal(progress.sessions.length, MAX_SESSIONS);
  assert.equal(progress.sessions[0].id, "s-1");
  assert.equal(progress.sessions.at(-1).id, "s-500");
});

const session = (over = {}) => ({
  id: "session-1",
  completedAt: 1000,
  mode: "mixed",
  score: 1,
  answered: 2,
  total: 2,
  sources: {
    nasm: { label: "NASM", correct: 1, attempted: 2 },
  },
  topics: {
    Assessment: { correct: 1, attempted: 2 },
  },
  ...over,
});

test("calculateAnalytics summarizes overall, sources, topics, and trend", () => {
  const analytics = calculateAnalytics([
    session(),
    session({
      id: "session-2",
      completedAt: 2000,
      score: 2,
      sources: { nutrition: { label: "Nutrition", correct: 2, attempted: 2 } },
      topics: { Protein: { correct: 2, attempted: 2 } },
    }),
  ]);
  assert.deepEqual(analytics.overall, { sessions: 2, correct: 3, attempted: 4, accuracy: 75 });
  assert.deepEqual(analytics.series.map((point) => point.accuracy), [50, 100]);
  assert.equal(analytics.sources.find((item) => item.key === "nasm").accuracy, 50);
  assert.equal(analytics.sources.find((item) => item.key === "nutrition").accuracy, 100);
  assert.equal(analytics.sources.find((item) => item.key === "muscles").accuracy, null);
  assert.equal(analytics.topics[0].topic, "Assessment");
  assert.equal(analytics.trend.direction, "up");
});

test("calculateAnalytics does not claim a trend from one session", () => {
  assert.equal(calculateAnalytics([session()]).trend.direction, "insufficient");
});

test("backup parsing validates format and merge is repeatable", () => {
  const current = recordSession(emptyProgress("local"), session());
  const importedProgress = recordSession(
    { ...emptyProgress("remote"), questions: { q2: { seen: 3, wrong: 1, lastSeen: 2000 } } },
    session({ id: "session-2", completedAt: 2000 }),
  );
  const backup = createBackup(importedProgress, 3000);
  const parsed = parseBackup(JSON.stringify(backup));
  const merged = mergeProgress(current, parsed.progress);
  const mergedAgain = mergeProgress(merged, parsed.progress);
  assert.equal(merged.sessions.length, 2);
  assert.deepEqual(mergedAgain.sessions, merged.sessions);
  assert.deepEqual(mergedAgain.questions, merged.questions);
  assert.throws(() => parseBackup("{"), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ format: "other", version: 1 })), /backup format/);
  assert.throws(() => parseBackup("x".repeat(2 * 1024 * 1024 + 1)), /too large/);
});

test("mergeProgress rejects conflicting sessions with the same id", () => {
  const current = recordSession(emptyProgress("local"), session());
  const imported = recordSession(emptyProgress("remote"), session({
    score: 2,
    sources: { nasm: { label: "NASM", correct: 2, attempted: 2 } },
    topics: { Assessment: { correct: 2, attempted: 2 } },
  }));
  assert.throws(() => mergeProgress(current, imported), /conflicting session/);
});

test("parseBackup rejects impossible question and session totals", () => {
  const badQuestions = emptyProgress("bad-questions");
  badQuestions.questions.q1 = { seen: 1, wrong: 2, lastSeen: 1000 };
  badQuestions.datasets[badQuestions.datasetId] = badQuestions.questions;
  assert.throws(() => parseBackup(JSON.stringify(createBackup(badQuestions, 2000))), /invalid/);

  const badSession = recordSession(emptyProgress("bad-session"), session());
  badSession.sessions[0].sources.nasm.attempted = 1;
  assert.throws(() => parseBackup(JSON.stringify(createBackup(badSession, 2000))), /invalid/);
});
