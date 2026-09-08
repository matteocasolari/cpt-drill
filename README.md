# CPT Drill

Personal NASM, NSCA, nutrition, exercise-identification, muscle-identification, gym-equipment-identification, and movement-identification practice drill. Each session serves **10** questions. Progress is stored locally in the browser under the `cptDrill.v2` localStorage key; existing v1 progress is migrated automatically.

## Run locally

From the repo root:

```bash
python3 -m http.server
```

Open [http://localhost:8000/](http://localhost:8000/) in your browser.

**Do not open `index.html` as a `file://` URL.** The app loads question banks with `fetch()` and needs a local HTTP server (or GitHub Pages).

## GitHub Pages

After merging to `main`:

1. Open the repo on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Deploy from a branch**.
4. Choose branch **`main`**, folder **`/ (root)`**, then save.

The site will be served from the repository root (`index.html`, `app.js`, `styles.css`, `data/`).

## Progress, backup, and source filters

The **Progress** screen records completed sessions and shows overall accuracy, recent score trends, a source-first breakdown, and a weakest-first topic breakdown. Confirmed answers still update question scheduling immediately, but only completed sessions appear in the dashboard history. Up to the 500 most recent completed sessions are retained.

Progress never leaves the device automatically. Use **Export backup** to download a JSON copy and **Import backup** to merge a copy from another browser or device. Re-importing the same backup does not duplicate its sessions or question counts. Clearing browser/site data removes any progress that has not been exported.

On the home screen, pick a question source before starting:

- **NASM** — NASM-only items plus shared `both` items.
- **NSCA** — NSCA-only items plus shared `both` items.
- **Nutrition** — questions derived from Rhiannon Lambert's *The Science of Nutrition*.
- **Mixed** — the default, with a balanced session containing every question category.
- **Exercises** — image-only exercise identification questions with four possible names.
- **Muscles** — image-only muscle identification questions with anatomically related distractors.
- **Equipment** — image-only gym-equipment identification questions with related distractors.
- **Movements** — image-only flexibility, bodyweight, and stability-ball movement identification questions.

**Reset progress** (footer link) asks for confirmation, then clears saved question statistics and session history and starts fresh.

During a quiz, use keys **1–4** to select an answer (true/false items only accept **1–2**) and **Enter** to confirm or continue. Wrong answers show an explanation; the results screen lists any misses from the session.

Optional headless check: `node scripts/simulate-session.mjs` runs a 10-question pass per source filter using the same engine as the UI.
