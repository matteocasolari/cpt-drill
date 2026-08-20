# PT Drill — static NASM/NSCA study quiz

Date: 2026-08-20  
Status: approved in conversation; awaiting spec file review before implementation plan

## Goal

A single-user, completely static quiz site for short recall sessions between clients. Host on GitHub Pages from the repo root (`/`). No backend, auth, analytics, CMS, service worker, or runtime LLM.

Purpose: remember material already read (NASM CPT 7 + NSCA-CPT style). Mix **exam recall** and **floor coaching** in one pool. Not a 100-item mock exam.

## Non-goals

- Accounts, sync, or multi-device progress (localStorage only)
- Full mock exams or timed tests
- Shipping source PDFs or OCR dumps with the site
- Question levels / difficulty filters
- Bundlers or npm required to *use* the site

## Sources (syllabus; do not deploy)

Prefer in this order for NASM exam-facing content:

1. `My Notes_ NASM Certified Personal Trainer 7 Course (CPT) (2).pdf` — CPT 7 course notes
2. `nasm-notes.txt` — OCR of NASM Essentials (~6th ed.); concepts only, messy OCR
3. `nsca-notes.txt` — OCR of NSCA Essentials of Personal Training (2nd ed.)

Rules:

- Extract concepts, numbers, models, progressions, contraindications, and clinical “when would you…” reasoning.
- Do **not** paste long verbatim book or PDF passages into the UI or JSON.
- Ignore OCR junk (running headers, broken lines, unreadable figure captions).
- If CPT 7 notes and NASM OCR disagree, **CPT 7 wins** for NASM items. Still author NSCA-specific items from NSCA notes (`source: nsca`).
- Tag every question `source`: `nasm` | `nsca` | `both`.

`.gitignore` must exclude `*.pdf`, `nasm-notes.txt`, `nsca-notes.txt`. Keep sources on disk for authoring; they must not appear on Pages.

## Architecture

Vanilla files at **repo root** (GitHub Pages: branch `main`, folder `/`):

| Path | Role |
|------|------|
| `index.html` | App shell: home, quiz, results |
| `styles.css` | Layout and dark theme |
| `app.js` | Filters, session of 6, scoring, keyboard, localStorage |
| `data/index.json` | Manifest: list of bank files to fetch |
| `data/*.json` | Question arrays |
| `README.md` | Local static server + Pages setup |
| `.gitignore` | PDFs, OCR dumps, OS junk |

No build step. Relative URLs only (`./data/...`) so a project site `https://<user>.github.io/<repo>/` works.

Startup: fetch `data/index.json`, then fetch listed files in parallel, concatenate arrays, drop invalid items (see Errors).

If JSON fetch fails (typical `file://` CORS), show a single message: use GitHub Pages or `python3 -m http.server` from the repo root, plus Retry. Do not support `file://` as a first-class path.

## Session flow

Home:

- Source control: **NASM** / **NSCA** / **Mixed**. Default **NASM** (primary notes / CPT 7).
- Show last session score if present
- Start
- Footer: Reset progress (`confirm()` then clear `ptDrill.v1`)

Each session: **exactly 6** questions from the filtered pool.

Pool:

- NASM → `source` is `nasm` or `both`
- NSCA → `nsca` or `both`
- Mixed → entire valid bank

No level filter. All valid questions share one pool per source filter.

Selection (deterministic buckets, shuffle inside each):

1. Never seen (no stats row)
2. `wrong > 0`, oldest `lastSeen` first
3. Remaining, oldest `lastSeen` first

Take 6. If fewer than 6 exist after validation, show “bank too small” and do not start (must not happen at ~800). Do not fill from other sources.

Quiz loop:

- Progress `n/6`, topic chip, stem, stacked choices
- `mcq` / `scenario`: 4 choices; `tf`: 2 choices (True / False)
- Keys **1–4** highlight/select; **Enter** confirms if a choice is selected
- Immediate reveal: correct/incorrect styling, explanation (2–5 sentences), topic already visible
- **Enter** or Continue → next question or results

Results: score `/6`, misses with explanations, **Another 6** (same source filter), link/button Home.

Keyboard: ignore number keys that do not match a visible choice (e.g. 3–4 on true/false).

## Progress (localStorage)

Key: `ptDrill.v1`

```json
{
  "lastScore": 4,
  "lastSource": "nasm",
  "questions": {
    "nasm-opt-012": { "seen": 3, "wrong": 1, "lastSeen": 1710000000000 }
  }
}
```

Update `seen`, `lastSeen` on every answered item; increment `wrong` only on incorrect. `lastScore` is 0–6 from the session just finished.

Corrupt JSON: delete the key and continue with empty progress.

Reset progress: only this key.

## Question bank

Target: **at least 800** questions (overshoot slightly if needed to finish a topic file). Generated from sources; no requirement to hand-verify every item.

Schema (required fields; **no `level`**):

```json
{
  "id": "nasm-opt-012",
  "source": "nasm",
  "type": "mcq",
  "topic": "OPT Phase 2",
  "question": "Stem…",
  "choices": ["…", "…", "…", "…"],
  "answerIndex": 1,
  "explanation": "Two to five sentences in study-notes voice."
}
```

Constraints:

- `id`: stable kebab-id, unique across the whole bank. Never reuse an id.
- `source`: `nasm` | `nsca` | `both`
- `type`: `mcq` | `tf` | `scenario`
- `topic`: short floor/exam label (e.g. `Overhead squat`, `Karvonen`, `NSCA screening`)
- `choices`: length 4 for `mcq` and `scenario`; length 2 for `tf`
- `answerIndex`: integer in range for `choices`
- Voice: a working PT would use this on the floor or on the CPT/NSCA exam. No page numbers, no author names, no trivia about the textbook.

Mix (targets, not hard quotas):

- Source: ~55% `nasm`, ~35% `nsca`, ~10% `both`
- Type: ~70% `mcq`, ~20% `scenario`, ~10% `tf` (`tf` sparingly)
- Content: exam recall (definitions, models, numbers, contraindications) **and** floor coaching (regression/progression, next step, refer vs train) in the **same** pool

Coverage minimum:

**NASM (CPT 7 first):** integrated training; basic exercise science; cardiorespiratory; bioenergetics; human movement; flexibility; assessments including overhead squat; OPT phases and acute variables; resistance, cardio, core, balance, plyometric, SAQ; special populations at PT scope; plus enough professional development, client relations, and behavioral coaching to match exam domains without turning the app into a business quiz.

**NSCA:** consultation/screening; resistance technique and program design; aerobic programming; plyometrics; speed/agility; nutrition at PT scope; common conditions (high-level, stay in PT scope: refer when required).

File split (authoring units; names may grow but stay under `data/`):

- `data/index.json` — `{ "files": ["nasm-science.json", ...] }`
- Topic-grouped JSON arrays, e.g. `nasm-science.json`, `nasm-assess.json`, `nasm-opt.json`, `nasm-programming.json`, `nasm-special.json`, `nsca-consult.json`, `nsca-resistance.json`, `nsca-aerobic.json`, `nsca-nutrition.json`, `nsca-conditions.json`

Load-time skip if: missing required field, unknown `source`/`type`, `choices` length mismatch, `answerIndex` out of range, duplicate `id` (keep first).

## UI

Phone-first, one column, tap targets ≥44px. Dark default: warm off-black background, paper-colored text, single accent (amber or rust). Fonts: `ui-sans-serif` for chrome; Georgia (or `ui-serif`) for the question stem. No Inter, no purple gradients, no hero illustrations.

Screens: Home, Quiz, Reveal (same view as quiz with result state), Results.

## Errors

| Case | Behavior |
|------|----------|
| Manifest or bank fetch fail | Plain error + Retry; tell user to use a static server or Pages |
| Invalid question | Skip; log `console.warn` with `id` |
| Valid pool < 6 | Do not start; “bank too small” |
| Bad localStorage | Wipe `ptDrill.v1` |

## Testing / verification (before calling it done)

- Serve with `python3 -m http.server` from repo root; complete a session of 6
- NASM-only, NSCA-only, Mixed each produce 6 items of the right `source`
- Reveal + explanations + results misses list
- Refresh preserves stats; Reset progress clears them
- Keyboard 1–4 and Enter
- True/false only accepts 1–2
- Confirm `data/` has ≥800 valid questions (`id` unique)
- README documents Pages: Settings → Pages → Deploy from branch `main` / `/` (root)
- Repo stays small: no PDFs, no OCR txt in git

## Implementation order

1. `.gitignore`, README stub, HTML/CSS/JS shell with empty/small load path
2. Schema + `data/index.json` + generate ~800 questions from sources into split JSON
3. Wire session, picking, localStorage, keyboard
4. Verify list above
5. Stop when the site is pushable and Pages can be enabled
