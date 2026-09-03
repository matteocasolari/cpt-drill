import { execFile } from "node:child_process";
import { access, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const legacyRoot = join(repoRoot, "data", "flexibility-body-weight-and-stability-ball-exercises");
const imageRoot = join(repoRoot, "data", "movements");
const run = promisify(execFile);

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

if (!await exists(imageRoot) && await exists(legacyRoot)) await rename(legacyRoot, imageRoot);
if (!await exists(imageRoot)) throw new Error("Missing movement image directory");

// [original filename, normalized slug, display label, distractor group]
const assets = [
  ["Abdominal Crunch.png", "feet-elevated-crunch", "Feet-elevated crunch", "bodyweight"],
  ["Arm Circle.png", "arm-circles", "Arm circles", "dynamic"],
  ["Arm Swing.png", "cross-body-arm-swings", "Cross-body arm swings", "dynamic"],
  ["Back Extension.png", "prone-back-extension", "Prone back extension", "bodyweight"],
  ["Back Hyperextension.png", "stability-ball-back-extension", "Stability-ball back extension", "ball"],
  ["Behind-Neck Stretch.png", "overhead-triceps-stretch", "Overhead triceps stretch", "flexibility"],
  ["Butterfly.png", "butterfly-stretch", "Butterfly stretch", "flexibility"],
  ["Elbow Bridge.png", "kneeling-stability-ball-rollout", "Kneeling stability-ball rollout", "ball"],
  ["Extended Abdominal Crunch.png", "stability-ball-crunch", "Stability-ball crunch", "ball"],
  ["Forward Lunge.png", "forward-lunge", "Forward lunge", "bodyweight"],
  ["Hands Behind Back.png", "hands-behind-back-chest-stretch", "Hands-behind-back chest stretch", "flexibility"],
  ["Heel Raise.png", "stair-calf-raise", "Stair calf raise", "bodyweight"],
  ["Hockey Lunge Walk.png", "hockey-lunge", "Hockey lunge", "bodyweight"],
  ["Look Right and Left.png", "neck-rotation", "Neck rotation", "flexibility"],
  ["Lunge Walk.png", "walking-lunge", "Walking lunge", "dynamic"],
  ["Lying Knee to Chest.png", "supine-knee-to-chest-stretch", "Supine knee-to-chest stretch", "flexibility"],
  ["Neck Flexion and Extension.png", "neck-flexion-extension", "Neck flexion and extension", "flexibility"],
  ["Pike Roll Out and In.png", "stability-ball-pike", "Stability-ball pike", "ball"],
  ["Pretzel.png", "seated-spinal-twist", "Seated spinal twist", "flexibility"],
  ["Push-Up.png", "push-up", "Push-up", "bodyweight"],
  ["Reverse Back Hyperextension.png", "stability-ball-reverse-hyperextension", "Stability-ball reverse hyperextension", "ball"],
  ["Semistraddle (Modified Hurdler’s Stretch).png", "modified-hurdler-stretch", "Modified hurdler stretch", "flexibility"],
  ["Stability Ball Push-Up.png", "stability-ball-push-up", "Stability-ball push-up", "ball"],
  ["Step-Up.png", "step-up", "Step-up", "bodyweight"],
  ["Supine Hip Lift.png", "stability-ball-hip-bridge", "Stability-ball hip bridge", "ball"],
  ["Supine Leg Curl.png", "stability-ball-leg-curl", "Stability-ball leg curl", "ball"],
  ["Variation - Modified Push-Up.png", "knee-push-up", "Knee push-up", "bodyweight"],
  ["Walking Knee Over Hurdle.png", "standing-hip-opener", "Standing hip opener", "dynamic"],
  ["Walking Knee Tuck.png", "walking-knee-hug", "Walking knee hug", "dynamic"],
  ["Wall Stretch.png", "wall-calf-stretch", "Wall calf stretch", "flexibility"],
];

const actualNames = new Set(await readdir(imageRoot));
for (const [original, slug] of assets) {
  const normalized = `${slug}.webp`;
  const source = [original, `${slug}.png`].find((name) => actualNames.has(name));
  if (!actualNames.has(normalized) && source) {
    await run("cwebp", ["-quiet", "-q", "88", "-m", "6", join(imageRoot, source), "-o", join(imageRoot, normalized)]);
    await unlink(join(imageRoot, source));
    actualNames.delete(source);
    actualNames.add(normalized);
  }
  if (!await exists(join(imageRoot, normalized))) throw new Error(`Missing movement image: ${normalized}`);
}

const listed = new Set((await readdir(imageRoot)).filter((name) => !name.startsWith(".")));
const expected = new Set(assets.map(([, slug]) => `${slug}.webp`));
const extra = [...listed].filter((name) => !expected.has(name));
if (extra.length) throw new Error(`Unmapped movement image(s): ${extra.join(", ")}`);

const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

const items = assets.map(([, slug, label, group]) => ({ slug, label, group }));
const questions = items.map((item) => {
  const related = items.filter((candidate) => candidate.slug !== item.slug && candidate.group === item.group);
  const start = hash(item.slug) % related.length;
  const distractors = Array.from({ length: 3 }, (_, index) => related[(start + index) % related.length]);
  const choices = [item.label, ...distractors.map((candidate) => candidate.label)];
  const shift = hash(`${item.slug}:answer`) % choices.length;
  const rotated = choices.slice(shift).concat(choices.slice(0, shift));
  return {
    id: `movement-${item.slug}`,
    source: "movements",
    type: "mcq",
    topic: "Movement identification",
    question: "Which movement is shown?",
    image: `./data/movements/${item.slug}.webp`,
    choices: rotated,
    answerIndex: rotated.indexOf(item.label),
    explanation: `The movement shown is the ${item.label}.`,
  };
});

await writeFile(join(repoRoot, "data", "movements.json"), `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Built ${questions.length} movement questions.`);
