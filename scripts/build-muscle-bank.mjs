import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.argv[2];
if (!sourceRoot) {
  console.error("Usage: node scripts/build-muscle-bank.mjs /path/to/muscle_images");
  process.exit(1);
}

const regionBySlug = new Map(Object.entries({
  vastus_lateralis: "thigh", vastus_medialis: "thigh", vastus_intramedius: "thigh", rectus_femoris: "thigh", sartorius: "thigh",
  psoas_minor: "hip", psoas_major: "hip", gluteus_minimus: "hip", gluteus_medius: "hip",
  tibialis_anterior: "lower-leg", soleus: "lower-leg", gastrocnemius: "lower-leg",
  pectoralis_major: "chest-core", rectus_abdominis: "chest-core", external_abdominal_oblique: "chest-core", quadratus_lumborum: "chest-core", serratus_anterior: "chest-core",
  biceps_brachii: "arm", triceps_brachii: "arm", brachialis: "arm", brachioradialis: "arm",
  supraspinatus: "shoulder-back", infraspinatus: "shoulder-back", deltoid: "shoulder-back", teres_major: "shoulder-back", rhomboid_major: "shoulder-back", trapezius: "shoulder-back", levator_scapulae: "shoulder-back",
  semispinalis: "neck", scalenus_anterior: "neck", longus_capitis: "neck", sternocleidomastoid: "neck", platysma: "neck", splenius_capitis: "neck", longus_colli: "neck", rectus_capitis_anterior: "neck", scalenus_medius: "neck", sternothyroid: "neck", rectus_capitis_posterior_major: "neck",
}));
const labelFor = (slug) => {
  const label = slug.replaceAll("_", " ");
  return label[0].toUpperCase() + label.slice(1);
};
const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

const filenames = (await readdir(sourceRoot)).filter((name) => [".png", ".jpg", ".jpeg", ".webp"].includes(extname(name).toLowerCase())).sort();
const muscles = filenames.map((filename) => {
  const slug = basename(filename, extname(filename));
  return { filename, slug, label: labelFor(slug), region: regionBySlug.get(slug) };
});
const unknown = muscles.filter((muscle) => !muscle.region);
if (unknown.length) throw new Error(`Missing anatomical region for: ${unknown.map((m) => m.slug).join(", ")}`);

const destination = join(repoRoot, "data", "muscle-images");
await mkdir(destination, { recursive: true });
const questions = [];
for (const muscle of muscles) {
  await copyFile(join(sourceRoot, muscle.filename), join(destination, muscle.filename));
  const related = muscles.filter((candidate) => candidate.slug !== muscle.slug && candidate.region === muscle.region);
  const unrelated = muscles.filter((candidate) => candidate.region !== muscle.region);
  const relatedStart = hash(muscle.slug) % related.length;
  const distractors = [related[relatedStart], related[(relatedStart + 1) % related.length], unrelated[hash(`${muscle.slug}:unrelated`) % unrelated.length]];
  const choices = [muscle.label, ...distractors.map((item) => item.label)];
  const shift = hash(`${muscle.slug}:answer`) % choices.length;
  const rotated = choices.slice(shift).concat(choices.slice(0, shift));
  questions.push({
    id: `muscle-${muscle.slug.replaceAll("_", "-")}`,
    source: "muscles",
    type: "mcq",
    topic: "Muscle identification",
    question: "Which muscle is shown?",
    image: `./data/muscle-images/${muscle.filename}`,
    choices: rotated,
    answerIndex: rotated.indexOf(muscle.label),
    explanation: `The highlighted muscle is the ${muscle.label}.`,
  });
}

await writeFile(join(repoRoot, "data", "muscles.json"), `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Built ${questions.length} muscle questions and copied their images.`);
