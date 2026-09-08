# Progress History and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist completed quiz sessions and add an overall, source-first, topic-level, time-trend dashboard with JSON backup and restore while preserving static GitHub Pages hosting.

**Architecture:** Keep storage, migration, session summaries, analytics, and backup merging as pure functions in `quiz-engine.js`; keep browser event handling and HTML/SVG rendering in `app.js`. Store compact completed-session summaries in a new `cptDrill.v2` record, migrate existing v1 progress at load time, and cap retained history at 500 sessions.

**Tech Stack:** Vanilla JavaScript ES modules, browser `localStorage`, semantic HTML, responsive CSS, inline SVG, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-progress-history-design.md`

## Global Constraints

- The app must remain a dependency-free static site deployable directly to GitHub Pages.
- Top-level source performance is the primary breakdown; topics are secondary.
- Only completed sessions appear in history and trends.
- Confirmed answers continue updating per-question statistics immediately.
- Import must be validated, non-destructive on failure, merge sessions by ID, and be idempotent for repeated backups.
- Do not add accounts, a backend, cloud synchronization, third-party analytics, or external chart libraries.

## File Structure

- `quiz-engine.js`: v2 progress schema, migration, completed-session summaries, analytics, backup creation/validation/merge.
- `quiz-engine.test.mjs`: unit coverage for every new pure-data behavior.
- `app.js`: exactly-once completion recording, Progress screen, inline SVG chart, and browser import/export interactions.
- `styles.css`: responsive dashboard and data-management presentation.
- `README.md`: persistence scope, reporting, export/import, and privacy limitations.

### Task 1: Versioned progress and completed-session history

**Files:**

- Modify: `quiz-engine.js`
- Modify: `quiz-engine.test.mjs`

**Deliverable:** Existing saved progress migrates to v2 and completed sessions are recorded once as compact, bounded summaries.

- [ ] Write failing tests asserting `emptyProgress()` returns schema version 2, a stable dataset ID, and `sessions: []`; `loadProgress()` migrates valid v1 data; and `recordSession()` groups answered responses by source/topic, excludes skipped questions from attempts, deduplicates by session ID, sorts chronologically, and retains the latest 500 sessions.
- [ ] Run `node --test quiz-engine.test.mjs` and confirm the new assertions fail for missing v2 fields and exports.
- [ ] Add `STORAGE_KEY = "cptDrill.v2"`, `PREVIOUS_STORAGE_KEYS`, `PROGRESS_VERSION = 2`, and `MAX_SESSIONS = 500`. Generate dataset/session identifiers from injected values so tests stay deterministic.
- [ ] Implement `createSessionSummary({ id, completedAt, mode, questions, responses })`, returning `{ id, completedAt, mode, score, answered, total, sources, topics }`, where each aggregate entry contains `{ correct, attempted }`.
- [ ] Implement `recordSession(progress, session)` as an immutable, ID-deduplicating append with chronological sorting and retention limiting.
- [ ] Expand validation and migration in `loadProgress()` while preserving the existing malformed-storage behavior and migrating from `cptDrill.v1` and `ptDrill.v1`.
- [ ] Run `node --test quiz-engine.test.mjs` and confirm all tests pass.
- [ ] Commit `quiz-engine.js` and `quiz-engine.test.mjs` with message `feat: persist completed drill sessions`.

### Task 2: Analytics and idempotent backups

**Files:**

- Modify: `quiz-engine.js`
- Modify: `quiz-engine.test.mjs`

**Deliverable:** Pure functions produce the dashboard model and safely round-trip/merge backup files.

- [ ] Write failing tests for `calculateAnalytics(progress.sessions)`: overall totals, chronological percentages, source aggregation, topic aggregation sorted weakest-first, no-attempt accuracy represented by `null`, and an insufficient-data trend result for fewer than two sessions.
- [ ] Write failing tests for `createBackup(progress, exportedAt)`, `parseBackup(text)`, and `mergeProgress(current, imported)`, including malformed JSON, unsupported versions, impossible counts/timestamps, conflicting duplicate session IDs, repeat-import idempotence, and combining independent dataset snapshots.
- [ ] Run `node --test quiz-engine.test.mjs` and confirm failures identify the missing analytics and backup exports.
- [ ] Implement aggregation helpers and `calculateAnalytics()` with source order `nasm`, `nsca`, `both`, `nutrition`, `exercises`, `muscles`, `equipment`, `movements`; calculate recent direction by comparing the average of up to five latest sessions with the preceding equal-sized window.
- [ ] Implement a backup envelope `{ format: "cpt-drill-backup", version: 1, exportedAt, datasets, progress }`. Maintain dataset snapshots in v2 progress so importing the same dataset replaces its cumulative question statistics instead of summing it again.
- [ ] Implement strict structural and numeric validation before returning parsed backup data. Reject files larger than 2 MiB in `parseBackup()` before parsing.
- [ ] Implement `mergeProgress()` to merge dataset snapshots, recompute cumulative question statistics from snapshots, merge identical sessions by ID, reject conflicting duplicates, sort sessions, and apply the 500-session limit.
- [ ] Run `node --test quiz-engine.test.mjs` and confirm all tests pass.
- [ ] Commit with message `feat: calculate progress analytics and merge backups`.

### Task 3: Progress dashboard and browser data controls

**Files:**

- Modify: `app.js`
- Modify: `styles.css`

**Deliverable:** Users can view source-first progress and export/import it from Home or Results.

- [ ] Add an exactly-once `sessionSaved` state flag. Reset it in `startSession()` and, in `finishSession()`, call `createSessionSummary()` and `recordSession()` before rendering Results only when false.
- [ ] Add Progress buttons to Home and Results, a `progress` screen route, and Back navigation that returns to Home.
- [ ] Implement `renderProgress()` using `calculateAnalytics()`: four summary cards, accessible trend summary, responsive inline SVG polyline/circles for the latest 30 sessions, ordered source performance bars/cards, and a weakest-first topic table.
- [ ] Add empty-state copy that explains results are recorded after a completed session.
- [ ] Add Export handling with `createBackup()`, `Blob`, `URL.createObjectURL()`, and a timestamped `cpt-drill-backup-YYYY-MM-DD.json` download.
- [ ] Add a visually hidden file input for Import. Read one selected JSON file, call `parseBackup()` and `mergeProgress()`, persist only after success, and render a success/error status without replacing current progress on error.
- [ ] Add CSS for `.dashboard-grid`, `.metric-card`, `.trend-chart`, `.source-stats`, `.performance-bar`, `.topic-table-wrap`, `.topic-table`, `.data-controls`, and responsive/mobile behavior using the existing color tokens and card language.
- [ ] Run `node --test quiz-engine.test.mjs validate-bank.test.mjs` and `node scripts/simulate-session.mjs`.
- [ ] Serve with `python3 -m http.server 8000`, verify Home → quiz → Results → Progress, then verify export/import round-trip, invalid import feedback, empty history, reset, keyboard navigation, and a narrow viewport.
- [ ] Commit `app.js` and `styles.css` with message `feat: add progress analytics dashboard`.

### Task 4: Documentation and final regression verification

**Files:**

- Modify: `README.md`

**Deliverable:** Repository documentation accurately describes the feature and the complete app passes regression checks.

- [ ] Update the README opening and progress section to describe completed-session history, overall/source/topic analytics, on-device-only storage, the 500-session history bound, JSON export/import, and the fact that clearing browser data removes unexported history.
- [ ] Run `node --test quiz-engine.test.mjs validate-bank.test.mjs`.
- [ ] Run `node scripts/simulate-session.mjs`.
- [ ] Run `git diff --check` and inspect `git status --short` to ensure only intended files changed.
- [ ] Commit `README.md` with message `docs: explain progress history and backups`.

### Task 5: Completion review

**Files:**

- Review: `quiz-engine.js`, `quiz-engine.test.mjs`, `app.js`, `styles.css`, `README.md`

**Deliverable:** The implementation matches the approved spec with current verification evidence.

- [ ] Review each requirement in `docs/superpowers/specs/2026-09-08-progress-history-design.md` against the finished diff.
- [ ] Run the complete automated verification commands again and retain their exit status/output for the handoff.
- [ ] Inspect the final responsive Progress screen and its empty/error states.
- [ ] Confirm existing user work is untouched and summarize commits, tests, local-only persistence limitations, and files changed.
