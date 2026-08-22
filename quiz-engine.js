export const STORAGE_KEY = "ptDrill.v1";
export const SESSION_SIZE = 10;

const SOURCES = new Set(["nasm", "nsca", "both", "exercises"]);
const TYPES = new Set(["mcq", "tf", "scenario"]);

export function emptyProgress() {
  return { lastScore: null, lastSource: null, questions: {} };
}

export function validateQuestion(q, seenIds) {
  if (!q || typeof q !== "object") return { ok: false, error: "not an object" };
  const { id, source, type, topic, question, image, choices, answerIndex, explanation } = q;
  if (typeof id !== "string" || !id.trim()) return { ok: false, error: "bad id" };
  if (seenIds.has(id)) return { ok: false, error: `duplicate id ${id}` };
  if (!SOURCES.has(source)) return { ok: false, error: `bad source ${id}` };
  if (!TYPES.has(type)) return { ok: false, error: `bad type ${id}` };
  if (typeof topic !== "string" || !topic.trim()) return { ok: false, error: `bad topic ${id}` };
  if (typeof question !== "string" || !question.trim()) return { ok: false, error: `bad question ${id}` };
  if (typeof explanation !== "string" || !explanation.trim()) return { ok: false, error: `bad explanation ${id}` };
  if (source === "exercises" && (typeof image !== "string" || !image.trim())) {
    return { ok: false, error: `bad image ${id}` };
  }
  if (!Array.isArray(choices) || !choices.every((c) => typeof c === "string" && c.trim())) {
    return { ok: false, error: `bad choices ${id}` };
  }
  const need = type === "tf" ? 2 : 4;
  if (choices.length !== need) return { ok: false, error: `choice count ${id}` };
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) {
    return { ok: false, error: `bad answerIndex ${id}` };
  }
  return { ok: true };
}

export function normalizeBank(rawItems) {
  const questions = [];
  const skipped = [];
  const seenIds = new Set();
  for (const item of rawItems) {
    const r = validateQuestion(item, seenIds);
    if (!r.ok) {
      skipped.push({ id: item && item.id, error: r.error });
      continue;
    }
    seenIds.add(item.id);
    questions.push(item);
  }
  return { questions, skipped };
}

export function filterPool(questions, sourceFilter) {
  if (sourceFilter === "mixed") {
    return questions.slice();
  }
  return questions.filter((q) => q.source === sourceFilter || q.source === "both");
}

function shuffle(arr, random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const VALID_LAST_SOURCES = new Set(["nasm", "nsca", "mixed", "exercises"]);

function isQuestionStat(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.seen === "number" &&
    typeof value.wrong === "number" &&
    typeof value.lastSeen === "number" &&
    Number.isFinite(value.seen) &&
    Number.isFinite(value.wrong) &&
    Number.isFinite(value.lastSeen)
  );
}

function isValidProgress(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (parsed.lastScore !== null) {
    if (typeof parsed.lastScore !== "number" || !Number.isFinite(parsed.lastScore)) return false;
    if (parsed.lastScore < 0 || parsed.lastScore > 6) return false;
  }
  if (parsed.lastSource !== null && !VALID_LAST_SOURCES.has(parsed.lastSource)) return false;
  const { questions } = parsed;
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) return false;
  for (const stat of Object.values(questions)) {
    if (!isQuestionStat(stat)) return false;
  }
  return true;
}

export function pickSession(pool, stats, count, random) {
  const unseen = [];
  const missed = [];
  const rest = [];
  for (const q of pool) {
    const s = stats[q.id];
    if (!s || !s.seen) unseen.push(q);
    else if (s.wrong > 0) missed.push(q);
    else rest.push(q);
  }
  const byOldest = (a, b) =>
    ((stats[a.id] && stats[a.id].lastSeen) || 0) - ((stats[b.id] && stats[b.id].lastSeen) || 0);
  missed.sort(byOldest);
  rest.sort(byOldest);
  const ordered = [...shuffle(unseen, random), ...missed, ...rest];
  return ordered.slice(0, Math.min(count, ordered.length));
}

export function loadProgress(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    if (!isValidProgress(parsed)) {
      if (storage.removeItem) storage.removeItem(STORAGE_KEY);
      return emptyProgress();
    }
    return {
      lastScore: parsed.lastScore,
      lastSource: parsed.lastSource,
      questions: parsed.questions,
    };
  } catch {
    if (storage.removeItem) storage.removeItem(STORAGE_KEY);
    return emptyProgress();
  }
}

export function saveProgress(storage, progress) {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function recordAnswer(progress, questionId, correct, now) {
  const questions = { ...progress.questions };
  const prev = questions[questionId] || { seen: 0, wrong: 0, lastSeen: 0 };
  questions[questionId] = {
    seen: prev.seen + 1,
    wrong: prev.wrong + (correct ? 0 : 1),
    lastSeen: now,
  };
  return { ...progress, questions };
}
