import { access, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const imageRoot = join(repoRoot, "data", "gym-equipment");

// [original filename, normalized slug, display label, distractor group]
const assets = [
  ["Ab_Roller.jpg", "ab-roller", "Ab roller", "functional"],
  ["Air_Bikes.jpg", "air-bike", "Air bike", "cardio"],
  ["Barbell.jpg", "barbell", "Barbell", "weights"],
  ["Barbell_Collars.jpg", "barbell-collars", "Barbell collars", "rack"],
  ["battle-ropes.jpg", "resistance-tube-set", "Resistance tube set", "functional"],
  ["Chalk.jpg", "lifting-chalk", "Lifting chalk", "accessories"],
  ["Chalk_Bowl.jpg", "chalk-bucket", "Chalk bucket", "accessories"],
  ["Chest_Press_Machine.jpg", "flat-weight-bench", "Flat weight bench", "stations"],
  ["Climbers.jpg", "elliptical-climber", "Elliptical climber", "cardio"],
  ["Cold_Tub.jpg", "cold-tub", "Cold tub", "recovery"],
  ["Deadlift_Jack.jpg", "deadlift-jack", "Deadlift jack", "rack"],
  ["Deadlift_Platform.jpg", "deadlift-platform", "Deadlift platform", "stations"],
  ["Dip_Station.jpg", "dip-station", "Dip station", "stations"],
  ["Dumbbells.jpg", "adjustable-dumbbells", "Adjustable dumbbells", "weights"],
  ["EZ_Curl_Bar.jpg", "ez-curl-bar", "EZ curl bar", "weights"],
  ["Elliptical_Machine.jpg", "elliptical-machine", "Elliptical machine", "cardio"],
  ["Exercise_Bike.jpg", "exercise-bike", "Exercise bike", "cardio"],
  ["Fitness_Tracker.jpg", "fitness-tracker", "Fitness tracker", "accessories"],
  ["Foam_Roller.jpg", "foam-roller", "Foam roller", "recovery"],
  ["Functional_Trainer.jpg", "functional-trainer", "Functional trainer", "machines"],
  ["Glute-Ham_Developer.jpg", "glute-ham-developer", "Glute-ham developer", "machines"],
  ["Gym_Flooring.jpg", "gym-flooring", "Gym flooring", "accessories"],
  ["Gymnastic_Rings.jpg", "gymnastic-rings", "Gymnastic rings", "functional"],
  ["J-cupsJ-hooks.jpg", "j-cups", "J-cups", "rack"],
  ["Jump_Rope.jpg", "jump-rope", "Jump rope", "functional"],
  ["Kettlebells.jpg", "kettlebell", "Kettlebell", "weights"],
  ["Knee_Sleeves.jpg", "knee-sleeves", "Knee sleeves", "wearable"],
  ["Landmine_Attachment.jpg", "landmine-attachment", "Landmine attachment", "rack"],
  ["Lat_Pulldown_Machine.jpg", "lat-pulldown-low-row-machine", "Lat pulldown and low row machine", "machines"],
  ["Leg_Curl_Machine.jpg", "rack-mounted-leg-extension", "Rack-mounted leg extension", "machines"],
  ["Leg_Extension_Machine.jpg", "leg-extension-curl-machine", "Leg extension and curl machine", "machines"],
  ["Leg_Press_Machine.jpg", "rack-mounted-leg-press", "Rack-mounted leg press", "machines"],
  ["Lifting_Shoes.jpg", "weightlifting-shoes", "Weightlifting shoes", "wearable"],
  ["Massage_Guns.jpg", "massage-gun", "Massage gun", "recovery"],
  ["medicine-ball.jpg", "wall-ball", "Wall ball", "weights"],
  ["Monolift_Attachment.jpg", "monolift-attachment", "Monolift attachment", "rack"],
  ["Peg_Board.jpg", "climbing-pegboard", "Climbing pegboard", "functional"],
  ["Plate_Tree.jpg", "weight-plate-tree", "Weight plate tree", "rack"],
  ["Plyo_Boxes.jpg", "plyometric-box", "Plyometric box", "functional"],
  ["Preacher_Curl_Bench.jpg", "preacher-curl-bench", "Preacher curl bench", "stations"],
  ["Pull-Up_Bar.jpg", "doorway-pull-up-bar", "Doorway pull-up bar", "stations"],
  ["Resistance_Bands.jpg", "resistance-bands", "Resistance bands", "functional"],
  ["Reverse_Hyper.jpg", "reverse-hyperextension-machine", "Reverse hyperextension machine", "machines"],
  ["Rowers.jpg", "rowing-machine", "Rowing machine", "cardio"],
  ["Running_Shoes.jpg", "running-shoes", "Running shoes", "wearable"],
  ["Safety_Pins.jpg", "hitch-pin", "Hitch pin", "rack"],
  ["Safety_Straps.jpg", "power-rack-safety-straps", "Power rack safety straps", "rack"],
  ["Shaker_Bottle.jpg", "shaker-bottle", "Shaker bottle", "accessories"],
  ["Ski_Erg.jpg", "ski-ergometer", "Ski ergometer", "cardio"],
  ["Sleds.jpg", "weight-sled", "Weight sled", "functional"],
  ["Smith_Machine.jpg", "smith-machine", "Smith machine", "machines"],
  ["Spotter_Arms.jpg", "spotter-arms", "Spotter arms", "rack"],
  ["Squat_RackPower_Cage.jpg", "power-rack", "Power rack", "stations"],
  ["Stair-Stepper.jpg", "stair-stepper", "Stair stepper", "cardio"],
  ["Suspension_Trainers.jpg", "suspension-trainer", "Suspension trainer", "functional"],
  ["Trap_Bar.jpg", "trap-bar", "Trap bar", "weights"],
  ["Treadmill.jpg", "curved-treadmill", "Curved treadmill", "cardio"],
  ["Weight_Bench.jpg", "adjustable-weight-bench", "Adjustable weight bench", "stations"],
  ["Weight_Plates.jpg", "bumper-plate", "Bumper plate", "weights"],
  ["Weighted_Vest.jpg", "weighted-vest", "Weighted vest", "wearable"],
  ["weightlifting-belt.jpg", "weighted-dip-belt", "Weighted dip belt", "wearable"],
  ["Workout_Mat.jpg", "exercise-mat", "Exercise mat", "recovery"],
  ["workout-mirror.jpeg", "smart-fitness-mirror", "Smart fitness mirror", "accessories"],
  ["Wrist_Wraps.jpg", "wrist-wraps", "Wrist wraps", "wearable"],
  ["barbell-squat-pad.webp", "barbell-squat-pad", "Barbell squat pad", "accessories"],
  ["captains-chair.webp", "captains-chair", "Captain's chair", "stations"],
  ["chest-pad.jpeg", "rack-mounted-chest-support", "Rack-mounted chest support", "rack"],
  ["exercise-ball.webp", "exercise-ball", "Exercise ball", "recovery"],
  ["lifting-straps.jpg", "lifting-straps", "Lifting straps", "wearable"],
  ["v-bar.jpg", "v-bar-cable-attachment", "V-bar cable attachment", "rack"],
];

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const actualNames = new Set(await readdir(imageRoot));
for (const [original, slug] of assets) {
  const extension = extname(original).toLowerCase();
  const normalized = `${slug}${extension}`;
  const originalPath = join(imageRoot, original);
  const normalizedPath = join(imageRoot, normalized);
  if (original !== normalized && actualNames.has(original) && !actualNames.has(normalized)) {
    if (original.toLowerCase() === normalized.toLowerCase()) {
      const temporaryPath = join(imageRoot, `.${normalized}.renaming`);
      await rename(originalPath, temporaryPath);
      await rename(temporaryPath, normalizedPath);
    } else {
      await rename(originalPath, normalizedPath);
    }
    actualNames.delete(original);
    actualNames.add(normalized);
  }
  if (!await exists(normalizedPath)) throw new Error(`Missing equipment image: ${normalized}`);
}

const listed = new Set((await readdir(imageRoot)).filter((name) => !name.startsWith(".")));
const expected = new Set(assets.map(([original, slug]) => `${slug}${extname(original).toLowerCase()}`));
const extra = [...listed].filter((name) => !expected.has(name));
if (extra.length) throw new Error(`Unmapped equipment image(s): ${extra.join(", ")}`);

const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

const items = assets.map(([original, slug, label, group]) => ({
  slug,
  label,
  group,
  filename: `${slug}${extname(original).toLowerCase()}`,
}));

const questions = items.map((item) => {
  const related = items.filter((candidate) => candidate.slug !== item.slug && candidate.group === item.group);
  const start = hash(item.slug) % related.length;
  const distractors = Array.from({ length: 3 }, (_, index) => related[(start + index) % related.length]);
  const choices = [item.label, ...distractors.map((candidate) => candidate.label)];
  const shift = hash(`${item.slug}:answer`) % choices.length;
  const rotated = choices.slice(shift).concat(choices.slice(0, shift));
  return {
    id: `equipment-${item.slug}`,
    source: "equipment",
    type: "mcq",
    topic: "Gym equipment identification",
    question: "Which piece of gym equipment is shown?",
    image: `./data/gym-equipment/${item.filename}`,
    choices: rotated,
    answerIndex: rotated.indexOf(item.label),
    explanation: `The pictured equipment is the ${item.label}.`,
  };
});

await writeFile(join(repoRoot, "data", "gym-equipment.json"), `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Built ${questions.length} gym-equipment questions.`);
