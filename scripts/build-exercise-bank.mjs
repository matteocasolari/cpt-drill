import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.argv[2];
if (!sourceRoot) {
  console.error("Usage: node scripts/build-exercise-bank.mjs /path/to/scraper/output");
  process.exit(1);
}

const records = JSON.parse(await readFile(join(sourceRoot, "exercises.json"), "utf8"));
const destination = join(repoRoot, "data", "exercise-images");
await mkdir(destination, { recursive: true });

const stop = new Set(["a", "and", "on", "the", "to", "with"]);
const tokens = (name) => new Set(name.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !stop.has(t)));
const sets = records.map((record) => tokens(record.name));
const overlap = (a, b) => {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(1, new Set([...a, ...b]).size);
};
const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

const questions = [];
for (let i = 0; i < records.length; i += 1) {
  const record = records[i];
  const filename = basename(record.image_file);
  await copyFile(join(sourceRoot, record.image_file), join(destination, filename));

  const ranked = records
    .map((candidate, j) => ({ candidate, j, score: j === i ? -1 : overlap(sets[i], sets[j]) }))
    .filter(({ j }) => j !== i)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
  const similar = ranked.slice(0, 2).map(({ candidate }) => candidate.name);
  const unrelatedPool = ranked.filter(({ score }) => score === 0);
  const unrelated = unrelatedPool[hash(record.name) % unrelatedPool.length]?.candidate.name
    ?? ranked.at(-1).candidate.name;
  const choices = [record.name, ...similar, unrelated];
  const shift = hash(`${record.name}:answer`) % choices.length;
  const rotated = choices.slice(shift).concat(choices.slice(0, shift));

  questions.push({
    id: `exercise-${filename.replace(/\.[^.]+$/, "")}`,
    source: "exercises",
    type: "mcq",
    topic: "Exercise identification",
    question: "Which exercise is shown?",
    image: `./data/exercise-images/${filename}`,
    choices: rotated,
    answerIndex: rotated.indexOf(record.name),
    explanation: `This exercise is the ${record.name}.`,
  });
}

await writeFile(join(repoRoot, "data", "exercises.json"), `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Built ${questions.length} exercise questions and copied their images.`);
