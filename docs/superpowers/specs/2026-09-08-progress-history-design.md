# Progress History and Analytics Design

## Goal

Add durable, useful progress reporting to CPT Drill without changing its static GitHub Pages deployment. Results remain private to the browser, with JSON export and import for backup or transfer.

## Scope

The feature records completed sessions and presents overall, source-level, topic-level, and time-based performance. Top-level sources are the primary reporting dimension; topic detail is secondary. Only completed sessions appear in history and trends. Existing per-question statistics continue to update as soon as an answer is confirmed.

The feature does not add accounts, cloud synchronization, a backend, third-party analytics, or external chart libraries.

## Persistence Model

Progress remains in browser `localStorage` under a new versioned key. Loading migrates valid `cptDrill.v1` or legacy `ptDrill.v1` data into the new format without losing per-question statistics.

The new progress object contains:

- the existing last score, last source, and per-question statistics;
- a schema version;
- a bounded list of completed session summaries.

Each completed session has a generated ID, completion timestamp, selected drill mode, score, number answered, session size, and compact correct/attempted totals grouped by source and topic. The application retains a generous fixed maximum number of recent sessions so local storage cannot grow without limit. Aggregated per-question statistics remain independent of this bounded history.

A session is persisted exactly once when the results screen is reached. Abandoned sessions do not create history entries. Finishing early records skipped questions in the session size but not as attempted answers.

## Analytics

Pure functions in the quiz engine calculate view models from session history:

- overall correct answers, attempts, accuracy, completed-session count, and recent direction;
- accuracy and attempts for each top-level source;
- accuracy and attempts for each topic;
- a chronological series of completed-session percentages.

Source reporting follows the question's actual source. Shared `both` questions contribute to a clearly labeled NASM + NSCA group rather than being counted twice. Mixed is a drill mode, not a performance category.

Percentages with no attempts display as unavailable instead of zero. Trend language and visuals avoid claiming improvement when there is insufficient data.

## User Interface

Home and Results expose a Progress action. The Progress screen contains, in order:

1. Overall summary cards.
2. A lightweight responsive SVG trend chart of completed-session scores over time.
3. Prominent source performance rows/cards, ordered by the app's established source order.
4. A secondary topic table, ordered by lowest accuracy first once a topic has attempts.
5. Data controls for export and import.

The screen follows the current visual system, remains usable on mobile, and uses semantic labels plus a textual trend summary so the chart is not the only representation of the data.

Export downloads a timestamped JSON backup containing the complete validated progress object and export metadata. Import uses a file picker, validates before modifying current data, merges sessions by stable session ID, and merges question statistics without double-counting data that originated from the same exported snapshot. To make repeated imports idempotent, backups carry a stable dataset identity and cumulative question-stat snapshot; imported snapshots from the same dataset supersede older snapshots rather than being added repeatedly. Invalid or incompatible files show an inline error and leave existing progress untouched.

Reset progress continues to clear all stored data after confirmation.

## Error Handling and Compatibility

Storage failures preserve the existing in-memory fallback and warning behavior. Corrupt active data is discarded safely. Migration and import reject malformed values, impossible scores, invalid timestamps, unknown structural versions, duplicate session records with conflicting contents, and unreasonably large payloads.

Question-bank changes do not invalidate historical summaries because sessions store their own compact category totals. Topic and source labels are stored as display values at completion time.

## Code Organization

- `quiz-engine.js`: schema creation/migration, session construction, analytics calculations, backup validation, and merge logic as testable pure functions.
- `app.js`: session completion integration, Progress routing/rendering, SVG output, and browser file download/upload interactions.
- `styles.css`: responsive dashboard, chart, source rows, topic table, messages, and data-control styling.
- `quiz-engine.test.mjs`: migration, recording, aggregation, history bounds, backup validation, and idempotent merge coverage.
- `README.md`: local-only persistence, analytics, export/import, and privacy limitations.

## Verification

Automated tests cover old-save migration, exactly-once completion recording, skipped answers, source/topic aggregation, trend ordering, retention bounds, malformed imports, conflicting duplicates, and repeat-import idempotence. Existing bank validation and simulated-session checks continue to pass.

Manual browser verification covers Home and Results navigation, empty history, multiple source types, responsive chart/table layout, export-download/import round trip, invalid import feedback, reset behavior, keyboard quiz behavior, and operation when local storage is unavailable.
