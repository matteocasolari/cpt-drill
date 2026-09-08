export const STORAGE_KEY = "cptDrill.v2";
export const LEGACY_STORAGE_KEY = "ptDrill.v1";
export const SESSION_SIZE = 10;
export const PROGRESS_VERSION = 2;
export const MAX_SESSIONS = 500;
export const PREVIOUS_STORAGE_KEYS = ["cptDrill.v1", LEGACY_STORAGE_KEY];

const SOURCE_LABELS = {
  nasm: "NASM",
  nsca: "NSCA",
  both: "NASM + NSCA",
  nutrition: "Nutrition",
  exercises: "Exercises",
  muscles: "Muscles",
  equipment: "Equipment",
  movements: "Movements",
};

const IMAGE_SOURCES = new Set(["exercises", "muscles", "equipment", "movements"]);
const CONTENT_SOURCES = new Set(["nasm", "nsca", "both", "nutrition"]);
const SOURCES = new Set([...CONTENT_SOURCES, ...IMAGE_SOURCES]);
const TYPES = new Set(["mcq", "tf", "scenario"]);

function makeId(prefix = "dataset") {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function emptyProgress(datasetId = makeId()) {
  return {
    version: PROGRESS_VERSION,
    datasetId,
    lastScore: null,
    lastSource: null,
    questions: {},
    sessions: [],
    datasets: { [datasetId]: {} },
  };
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
  if (IMAGE_SOURCES.has(source) && (typeof image !== "string" || !image.trim())) {
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
  if (IMAGE_SOURCES.has(sourceFilter)) {
    return questions.filter((q) => q.source === sourceFilter);
  }
  if (sourceFilter === "nutrition") {
    return questions.filter((q) => q.source === sourceFilter);
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

const VALID_LAST_SOURCES = new Set(["nasm", "nsca", "nutrition", "mixed", ...IMAGE_SOURCES]);

function isQuestionStat(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isInteger(value.seen) && value.seen >= 0 &&
    Number.isInteger(value.wrong) && value.wrong >= 0 && value.wrong <= value.seen &&
    Number.isFinite(value.lastSeen) && value.lastSeen >= 0
  );
}

function isQuestions(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(isQuestionStat);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function isAggregateMap(value, withLabel = false) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry) &&
    isCount(entry.correct) && isCount(entry.attempted) && entry.correct <= entry.attempted &&
    (!withLabel || (typeof entry.label === "string" && entry.label.length > 0))
  );
}

function isSession(value) {
  if (!(value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.id === "string" && value.id.length > 0 &&
    Number.isFinite(value.completedAt) && value.completedAt > 0 &&
    VALID_LAST_SOURCES.has(value.mode) && isCount(value.score) &&
    isCount(value.answered) && isCount(value.total) &&
    value.score <= value.answered && value.answered <= value.total &&
    isAggregateMap(value.sources, true) && isAggregateMap(value.topics))) return false;
  const totals = (entries) => Object.values(entries).reduce((sum, entry) => ({
    correct: sum.correct + entry.correct,
    attempted: sum.attempted + entry.attempted,
  }), { correct: 0, attempted: 0 });
  const sources = totals(value.sources);
  const topics = totals(value.topics);
  return sources.correct === value.score && sources.attempted === value.answered &&
    topics.correct === value.score && topics.attempted === value.answered;
}

function isValidBaseProgress(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (parsed.lastScore !== null) {
    if (typeof parsed.lastScore !== "number" || !Number.isFinite(parsed.lastScore)) return false;
    if (parsed.lastScore < 0 || parsed.lastScore > SESSION_SIZE) return false;
  }
  if (parsed.lastSource !== null && !VALID_LAST_SOURCES.has(parsed.lastSource)) return false;
  return isQuestions(parsed.questions);
}

function isValidV2Progress(parsed) {
  return isValidBaseProgress(parsed) && parsed.version === PROGRESS_VERSION &&
    typeof parsed.datasetId === "string" && parsed.datasetId.length > 0 &&
    Array.isArray(parsed.sessions) && parsed.sessions.length <= MAX_SESSIONS && parsed.sessions.every(isSession) &&
    parsed.datasets && typeof parsed.datasets === "object" && !Array.isArray(parsed.datasets) &&
    Object.values(parsed.datasets).every(isQuestions);
}

function migrateProgress(parsed) {
  const next = emptyProgress();
  next.lastScore = parsed.lastScore;
  next.lastSource = parsed.lastSource;
  next.questions = parsed.questions;
  next.datasets[next.datasetId] = parsed.questions;
  return next;
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

export function pickMixedSession(questions, stats, count, random) {
  const groups = [
    questions.filter((q) => q.source === "nasm" || q.source === "both"),
    questions.filter((q) => q.source === "nsca"),
    questions.filter((q) => q.source === "nutrition"),
    questions.filter((q) => q.source === "exercises"),
    questions.filter((q) => q.source === "muscles"),
    questions.filter((q) => q.source === "equipment"),
    questions.filter((q) => q.source === "movements"),
  ];
  const base = Math.floor(count / groups.length);
  const remainder = count % groups.length;
  const picked = groups.flatMap((group, index) =>
    pickSession(group, stats, base + (index < remainder ? 1 : 0), random)
  );
  return shuffle(picked, random);
}

export function loadProgress(storage) {
  let activeKey = STORAGE_KEY;
  try {
    let raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of PREVIOUS_STORAGE_KEYS) {
        raw = storage.getItem(key);
        if (raw) {
          activeKey = key;
          break;
        }
      }
    }
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    let progress;
    if (isValidV2Progress(parsed)) progress = parsed;
    else if (isValidBaseProgress(parsed)) progress = migrateProgress(parsed);
    else {
      if (storage.removeItem) storage.removeItem(activeKey);
      return emptyProgress();
    }
    if (activeKey !== STORAGE_KEY || progress !== parsed) {
      storage.setItem(STORAGE_KEY, JSON.stringify(progress));
      if (storage.removeItem && activeKey !== STORAGE_KEY) storage.removeItem(activeKey);
    }
    return progress;
  } catch {
    if (storage.removeItem) storage.removeItem(activeKey);
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
  const datasets = { ...(progress.datasets || {}) };
  const ownQuestions = { ...(datasets[progress.datasetId] || {}) };
  const ownPrev = ownQuestions[questionId] || { seen: 0, wrong: 0, lastSeen: 0 };
  ownQuestions[questionId] = {
    seen: ownPrev.seen + 1,
    wrong: ownPrev.wrong + (correct ? 0 : 1),
    lastSeen: now,
  };
  datasets[progress.datasetId] = ownQuestions;
  return { ...progress, questions, datasets };
}

function addAggregate(target, key, correct, label) {
  const entry = target[key] || { ...(label ? { label } : {}), correct: 0, attempted: 0 };
  entry.correct += correct ? 1 : 0;
  entry.attempted += 1;
  target[key] = entry;
}

export function createSessionSummary({ id = makeId("session"), completedAt = Date.now(), mode, questions, responses }) {
  const sources = {};
  const topics = {};
  let score = 0;
  let answered = 0;
  questions.forEach((question, index) => {
    const response = responses[index];
    if (!response) return;
    answered += 1;
    if (response.correct) score += 1;
    addAggregate(sources, question.source, response.correct, SOURCE_LABELS[question.source] || question.source);
    addAggregate(topics, question.topic, response.correct);
  });
  return { id, completedAt, mode, score, answered, total: questions.length, sources, topics };
}

export function recordSession(progress, session) {
  if (!isSession(session)) throw new Error("Invalid session summary");
  const existing = (progress.sessions || []).find((item) => item.id === session.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(session)) throw new Error("Conflicting session id");
    return progress;
  }
  const sessions = [...(progress.sessions || []), session]
    .sort((a, b) => a.completedAt - b.completedAt)
    .slice(-MAX_SESSIONS);
  return { ...progress, sessions };
}

function accuracy(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : null;
}

export function calculateAnalytics(sessions) {
  const ordered = sessions.slice().sort((a, b) => a.completedAt - b.completedAt);
  const sourceTotals = Object.fromEntries(Object.entries(SOURCE_LABELS).map(([key, label]) => [key, { key, label, correct: 0, attempted: 0 }]));
  const topicTotals = {};
  let correct = 0;
  let attempted = 0;
  for (const item of ordered) {
    correct += item.score;
    attempted += item.answered;
    for (const [key, value] of Object.entries(item.sources)) {
      const target = sourceTotals[key] || (sourceTotals[key] = { key, label: value.label || key, correct: 0, attempted: 0 });
      target.correct += value.correct;
      target.attempted += value.attempted;
    }
    for (const [topic, value] of Object.entries(item.topics)) {
      const target = topicTotals[topic] || (topicTotals[topic] = { topic, correct: 0, attempted: 0 });
      target.correct += value.correct;
      target.attempted += value.attempted;
    }
  }
  const sources = Object.values(sourceTotals).map((item) => ({ ...item, accuracy: accuracy(item.correct, item.attempted) }));
  const topics = Object.values(topicTotals)
    .map((item) => ({ ...item, accuracy: accuracy(item.correct, item.attempted) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted || a.topic.localeCompare(b.topic));
  const series = ordered.map((item) => ({ id: item.id, completedAt: item.completedAt, accuracy: accuracy(item.score, item.answered) }));
  let trend = { direction: "insufficient", change: null };
  if (series.length >= 2) {
    const size = Math.min(5, Math.floor(series.length / 2));
    const recent = series.slice(-size);
    const previous = series.slice(-size * 2, -size);
    const average = (items) => items.reduce((sum, item) => sum + (item.accuracy || 0), 0) / items.length;
    const change = Math.round(average(recent) - average(previous));
    trend = { direction: change > 0 ? "up" : change < 0 ? "down" : "flat", change };
  }
  return { overall: { sessions: ordered.length, correct, attempted, accuracy: accuracy(correct, attempted) }, sources, topics, series, trend };
}

function withCurrentSnapshot(progress) {
  const datasets = { ...(progress.datasets || {}) };
  if (!datasets[progress.datasetId] || (Object.keys(datasets).length === 1 && Object.keys(datasets[progress.datasetId]).length === 0)) {
    datasets[progress.datasetId] = progress.questions;
  }
  return { ...progress, datasets };
}

export function createBackup(progress, exportedAt = Date.now()) {
  return { format: "cpt-drill-backup", version: 1, exportedAt, progress: withCurrentSnapshot(progress) };
}

export function parseBackup(text) {
  if (typeof text !== "string" || text.length > 2 * 1024 * 1024) throw new Error("Backup file is too large");
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("Backup is not valid JSON");
  }
  if (!backup || backup.format !== "cpt-drill-backup" || backup.version !== 1) throw new Error("Unsupported backup format");
  if (!Number.isFinite(backup.exportedAt) || backup.exportedAt <= 0 || !isValidV2Progress(backup.progress)) throw new Error("Backup data is invalid");
  return backup;
}

function mergeQuestionSnapshots(datasets) {
  const questions = {};
  for (const snapshot of Object.values(datasets)) {
    for (const [id, stat] of Object.entries(snapshot)) {
      const prev = questions[id] || { seen: 0, wrong: 0, lastSeen: 0 };
      questions[id] = { seen: prev.seen + stat.seen, wrong: prev.wrong + stat.wrong, lastSeen: Math.max(prev.lastSeen, stat.lastSeen) };
    }
  }
  return questions;
}

function newerSnapshot(a = {}, b = {}) {
  const result = { ...a };
  for (const [id, stat] of Object.entries(b)) {
    const current = result[id];
    if (!current || stat.seen > current.seen || (stat.seen === current.seen && stat.lastSeen > current.lastSeen)) result[id] = stat;
  }
  return result;
}

export function mergeProgress(current, imported) {
  if (!isValidV2Progress(imported)) throw new Error("Imported progress is invalid");
  const local = withCurrentSnapshot(current);
  const remote = withCurrentSnapshot(imported);
  const datasets = { ...local.datasets };
  for (const [id, snapshot] of Object.entries(remote.datasets)) datasets[id] = newerSnapshot(datasets[id], snapshot);
  let merged = { ...local, datasets, questions: mergeQuestionSnapshots(datasets) };
  for (const item of remote.sessions) {
    const existing = merged.sessions.find((candidate) => candidate.id === item.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error(`Import contains conflicting session ${item.id}`);
    if (!existing) merged = recordSession(merged, item);
  }
  if ((imported.sessions.at(-1)?.completedAt || 0) > (current.sessions.at(-1)?.completedAt || 0)) {
    merged.lastScore = imported.lastScore;
    merged.lastSource = imported.lastSource;
  }
  return merged;
}
