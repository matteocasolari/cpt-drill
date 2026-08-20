// Quality audit for the question bank. Reports the metrics that the bank must hold to:
// option-length neutrality, served-pool type mix, duplicate/twin detection, scenario structure.
// Usage: node scripts/audit-bank.mjs [--json] [--list <check>]
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBank, filterPool } from "../quiz-engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listOnly = (() => {
  const i = process.argv.indexOf("--list");
  return i < 0 ? null : process.argv[i + 1];
})();

const index = JSON.parse(await readFile(join(root, "data/index.json"), "utf8"));
const fileOf = new Map();
const raw = [];
for (const f of index.files) {
  const arr = JSON.parse(await readFile(join(root, "data", f), "utf8"));
  for (const q of arr) fileOf.set(q.id, f);
  raw.push(...arr);
}
const { questions } = normalizeBank(raw);
const four = questions.filter((q) => q.choices.length === 4);

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const chars = (s) => s.replace(/\s+/g, " ").trim().length;

// A key counts as "longest" unless some distractor is strictly longer.
function keyLongest(q, measure) {
  const k = measure(q.choices[q.answerIndex]);
  return !q.choices.some((c, i) => i !== q.answerIndex && measure(c) > k);
}

function rate(items, measure) {
  if (!items.length) return { n: 0, hits: 0, pct: 0 };
  const hits = items.filter((q) => keyLongest(q, measure)).length;
  return { n: items.length, hits, pct: +((100 * hits) / items.length).toFixed(1) };
}

// ---------- option length neutrality ----------
const lengthReport = {
  global: { chars: rate(four, chars), words: rate(four, words) },
  byFile: {},
  byType: {},
};
for (const f of index.files) {
  const items = four.filter((q) => fileOf.get(q.id) === f);
  if (items.length) lengthReport.byFile[f] = { chars: rate(items, chars), words: rate(items, words) };
}
for (const t of ["mcq", "scenario"]) {
  const items = four.filter((q) => q.type === t);
  if (items.length) lengthReport.byType[t] = { chars: rate(items, chars), words: rate(items, words) };
}

// ---------- source + type mix, served pools ----------
const count = (arr, k, v) => arr.filter((q) => q[k] === v).length;
const pct = (x, n) => +((100 * x) / n).toFixed(1);
const mix = {
  n: questions.length,
  source: {
    nasm: count(questions, "source", "nasm"),
    nsca: count(questions, "source", "nsca"),
    both: count(questions, "source", "both"),
  },
  type: {
    mcq: count(questions, "type", "mcq"),
    scenario: count(questions, "type", "scenario"),
    tf: count(questions, "type", "tf"),
  },
  servedPools: {},
};
for (const p of ["nasm", "nsca", "mixed"]) {
  const pool = filterPool(questions, p);
  mix.servedPools[p] = {
    n: pool.length,
    mcq: pct(count(pool, "type", "mcq"), pool.length),
    scenario: pct(count(pool, "type", "scenario"), pool.length),
    tf: pct(count(pool, "type", "tf"), pool.length),
  };
}

// ---------- stems ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stemSeen = new Map();
const dupStems = [];
for (const q of questions) {
  const k = norm(q.question);
  if (stemSeen.has(k)) dupStems.push([stemSeen.get(k), q.id]);
  else stemSeen.set(k, q.id);
}

// ---------- content twins (stem + key + explanation) ----------
const STOP = new Set(
  ("a an the of to in for and or is are be with that this which what who whom how why when where on at as by from " +
    "it its their they them client clients trainer personal should would could can may might not no does do did " +
    "than then there these those into during while about above below over under between within without because " +
    "following describes describe described statement following true false correct best most least").split(" ")
);
function bag(q) {
  const text = [q.question, q.choices[q.answerIndex], q.explanation].join(" ");
  return new Set(
    norm(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}
const bags = questions.map((q) => ({ q, set: bag(q) }));
// twins only matter if they can be served together
const coServed = (a, b) =>
  a.source === b.source || a.source === "both" || b.source === "both";
const twins = [];
for (let i = 0; i < bags.length; i++) {
  for (let j = i + 1; j < bags.length; j++) {
    if (!coServed(bags[i].q, bags[j].q)) continue;
    const A = bags[i].set, B = bags[j].set;
    if (!A.size || !B.size) continue;
    const small = A.size < B.size ? A : B;
    const big = A.size < B.size ? B : A;
    if (small.size / big.size < 0.45) continue; // cannot reach 0.45 Jaccard
    let inter = 0;
    for (const t of small) if (big.has(t)) inter++;
    const jac = inter / (A.size + B.size - inter);
    if (jac >= 0.45) twins.push({ a: bags[i].q.id, b: bags[j].q.id, jac: +jac.toFixed(3) });
  }
}
twins.sort((x, y) => y.jac - x.jac);

// ---------- repeated explanation sentences (>=9 words) ----------
function sentences(text) {
  const masked = text
    .replace(/(\d)\.(\d)/g, "$1\u0002$2")
    // treat these as abbreviations only when a new sentence does not follow
    .replace(/\b(e\.g|i\.e|etc|vs|approx|Dr|Fig|mg|dl|oz|in|cm|kg|lb)\.(?!\s+[A-Z])/gi, "$1\u0001");
  return masked
    .split(/(?<=[.!?])\s+(?=[A-Z(“"']|\d)/)
    .map((s) => s.replace(/\u0001/g, ".").replace(/\u0002/g, ".").trim())
    .filter(Boolean);
}
const sentSeen = new Map();
const repeatedSentences = [];
for (const q of questions) {
  for (const s of sentences(q.explanation)) {
    if (words(s) < 9) continue;
    const k = norm(s);
    if (sentSeen.has(k)) repeatedSentences.push({ a: sentSeen.get(k), b: q.id, sentence: s.slice(0, 90) });
    else sentSeen.set(k, q.id);
  }
}

// ---------- explanation sentence-count compliance ----------
const badExplanation = questions
  .map((q) => ({ id: q.id, n: sentences(q.explanation).length }))
  .filter((x) => x.n < 2 || x.n > 5);

// ---------- scenario structural audit ----------
// A scenario needs a person/situation AND a decision/application demand.
// A scenario must name a person and set up a situation before asking its question,
// rather than asking for a bare recalled fact.
const ACTOR =
  /\b(\d{1,2}[-\s]?year[-\s]?old|client|clients|client's|trainer|athlete|runner|parent|member|novice|beginner|patient|woman|man|male|female|player|exerciser|lifter)\b/i;
const scenarioIssues = [];
for (const q of questions.filter((x) => x.type === "scenario")) {
  const s = q.question;
  const flags = [];
  if (!ACTOR.test(s)) flags.push("no-actor");
  // setup + question: a situation stated, then something asked of it
  const parts = sentences(s);
  if (parts.length < 2) flags.push("no-setup");
  if (!/\?\s*$/.test(s)) flags.push("not-a-question");
  if (words(s) < 14) flags.push("very-short");
  if (flags.length) scenarioIssues.push({ id: q.id, file: fileOf.get(q.id), flags, q: s.slice(0, 95) });
}

// ---------- text-referential stems ----------
const TEXTREF = /\b(according to the text|the text (states|says)|stated explicitly|as (described|stated|listed|discussed|noted) (in the text|above)?|is described as|are described as|which .{0,30}\b(is|are) described|described in the (text|chapter)|the chapter)\b/i;
const textRef = questions.filter((q) => TEXTREF.test(q.question)).map((q) => ({ id: q.id, q: q.question.slice(0, 95) }));

// ---------- schema strictness ----------
const ALLOWED = new Set(["id", "source", "type", "topic", "question", "choices", "answerIndex", "explanation"]);
const schemaIssues = [];
for (const q of questions) {
  const extra = Object.keys(q).filter((k) => !ALLOWED.has(k));
  if (extra.length) schemaIssues.push({ id: q.id, extra });
}

// ---------- numeric option ordering ----------
function leadingNumber(s) {
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
const numericUnordered = [];
for (const q of four) {
  const nums = q.choices.map(leadingNumber);
  if (nums.some((n) => n === null)) continue;
  const allNumericStart = q.choices.every((c) => /^[^A-Za-z]*\d/.test(c));
  if (!allNumericStart) continue;
  const asc = [...nums].sort((a, b) => a - b);
  const desc = [...asc].reverse();
  if (nums.join() !== asc.join() && nums.join() !== desc.join())
    numericUnordered.push({ id: q.id, nums });
}

const report = {
  totals: mix,
  optionLength: lengthReport,
  duplicateStems: dupStems.length,
  duplicateStemPairs: dupStems,
  contentTwins: twins.length,
  repeatedSentences: repeatedSentences.length,
  explanationOutOfRange: badExplanation.length,
  scenarioIssues: scenarioIssues.length,
  textReferentialStems: textRef.length,
  schemaIssues: schemaIssues.length,
  numericUnordered: numericUnordered.length,
};

if (listOnly) {
  const lists = {
    twins,
    repeated: repeatedSentences,
    scenarios: scenarioIssues,
    textref: textRef,
    numeric: numericUnordered,
    schema: schemaIssues,
    explanation: badExplanation,
    stems: dupStems,
  };
  console.log(JSON.stringify(lists[listOnly] ?? [], null, 1));
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("total", mix.n, "| source", mix.source, "| type", mix.type);
  console.log("served pools (type %):");
  for (const [k, v] of Object.entries(mix.servedPools)) console.log("  ", k, v);
  console.log("\ncorrect-answer-is-longest:");
  console.log("   GLOBAL chars", lengthReport.global.chars, "words", lengthReport.global.words);
  for (const [f, v] of Object.entries(lengthReport.byFile))
    console.log(`   ${f.padEnd(24)} chars ${String(v.chars.pct).padStart(5)}%  words ${String(v.words.pct).padStart(5)}%  (n=${v.chars.n})`);
  for (const [t, v] of Object.entries(lengthReport.byType))
    console.log(`   type:${t.padEnd(19)} chars ${String(v.chars.pct).padStart(5)}%  words ${String(v.words.pct).padStart(5)}%  (n=${v.chars.n})`);
  console.log("\nduplicate normalized stems:", report.duplicateStems);
  console.log("content twins (Jaccard>=0.45, co-served):", report.contentTwins);
  console.log("repeated explanation sentences (>=9 words):", report.repeatedSentences);
  console.log("explanations outside 2-5 sentences:", report.explanationOutOfRange);
  console.log("scenario structural issues:", report.scenarioIssues);
  console.log("text-referential stems:", report.textReferentialStems);
  console.log("schema violations (extra keys):", report.schemaIssues);
  console.log("numeric options not monotonic:", report.numericUnordered);
}
