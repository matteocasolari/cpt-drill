# PT Drill

Personal NASM and NSCA practice drill. Each session serves **10** questions from a bank of 1,010 items. Progress (scores, per-question stats) is stored in the browser under the `ptDrill.v1` localStorage key.

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

## Source filter and reset progress

On the home screen, pick a question source before starting:

- **NASM** — NASM-only items plus shared `both` items.
- **NSCA** — NSCA-only items plus shared `both` items.
- **Mixed** — all sources.

**Reset progress** (footer link) asks for confirmation, then clears the `ptDrill.v1` localStorage key and starts fresh.

During a quiz, use keys **1–4** to select an answer (true/false items only accept **1–2**) and **Enter** to confirm or continue. Wrong answers show an explanation; the results screen lists any misses from the session.

Optional headless check: `node scripts/simulate-session.mjs` runs a 10-question pass per source filter using the same engine as the UI.
