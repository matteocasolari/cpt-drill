import {
  SESSION_SIZE,
  STORAGE_KEY,
  filterPool,
  pickSession,
  pickMixedSession,
  loadProgress,
  saveProgress,
  recordAnswer,
  normalizeBank,
  emptyProgress,
} from "./quiz-engine.js";

const app = document.getElementById("app");

let storageWarned = false;

function resolveStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "__ptDrill_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = resolveStorage();

function warnStorageOnce(message) {
  if (!storageWarned) {
    storageWarned = true;
    console.warn(message);
  }
}

function safeLoadProgress() {
  if (!storage) {
    warnStorageOnce("localStorage unavailable; progress will stay in memory only.");
    return emptyProgress();
  }
  try {
    return loadProgress(storage);
  } catch {
    warnStorageOnce("Could not load progress from localStorage; starting fresh.");
    return emptyProgress();
  }
}

function safeSaveProgress(data) {
  if (!storage) {
    warnStorageOnce("localStorage unavailable; progress will stay in memory only.");
    return;
  }
  try {
    saveProgress(storage, data);
  } catch {
    warnStorageOnce("Could not save progress to localStorage.");
  }
}

function safeClearProgress() {
  progress = emptyProgress();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    warnStorageOnce("Could not clear progress from localStorage.");
  }
}

let questions = [];
let progress = safeLoadProgress();

const state = {
  screen: "home", // "home" | "quiz" | "results" | "error"
  sourceFilter: "nasm",
  session: [],
  index: 0,
  selected: null,
  revealed: false,
  misses: [],
  score: 0,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function loadBank() {
  const indexRes = await fetch("./data/index.json");
  if (!indexRes.ok) throw new Error(`index.json responded ${indexRes.status}`);
  const manifest = await indexRes.json();
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const banks = await Promise.all(
    files.map(async (file) => {
      const res = await fetch(`./data/${file}`);
      if (!res.ok) throw new Error(`${file} responded ${res.status}`);
      return res.json();
    })
  );
  const raw = banks.flat();
  const { questions: valid, skipped } = normalizeBank(raw);
  for (const item of skipped) {
    console.warn("Skipped invalid question", item);
  }
  return valid;
}

async function boot() {
  try {
    questions = await loadBank();
    state.screen = "home";
  } catch (err) {
    console.warn("Failed to load question bank", err);
    state.screen = "error";
  }
  render();
}

function sourceButton(value, label) {
  const selected = state.sourceFilter === value;
  const cls = selected ? " is-selected" : "";
  return `<button data-action="set-source" data-source="${value}" class="${cls.trim()}" aria-pressed="${selected}">${label}</button>`;
}

function renderHome() {
  const pool = filterPool(questions, state.sourceFilter);
  const tooSmall = pool.length < SESSION_SIZE;
  const lastScoreLine =
    progress.lastScore !== null
      ? `<p class="muted">Last session: ${progress.lastScore}/${SESSION_SIZE}</p>`
      : "";

  app.innerHTML = `
    <div class="stack">
      <div>
        <h1>PT Drill</h1>
        ${lastScoreLine}
      </div>
      <div class="source-group" role="group" aria-label="Question source">
        ${sourceButton("mixed", "Mixed")}
        ${sourceButton("nasm", "NASM")}
        ${sourceButton("nsca", "NSCA")}
        ${sourceButton("exercises", "Exercises")}
        ${sourceButton("muscles", "Muscles")}
      </div>
      <button class="primary" data-action="start" ${tooSmall ? "disabled" : ""}>
        ${tooSmall ? "Bank too small" : "Start"}
      </button>
    </div>
    <div class="footer-link">
      <button data-action="reset">Reset progress</button>
    </div>
  `;
}

function renderQuiz() {
  const q = state.session[state.index];
  const imageQuestion = q.source === "exercises" || q.source === "muscles";
  const promptHtml = imageQuestion
    ? `<img class="quiz-image" src="${escapeHtml(q.image)}" alt="${q.source === "muscles" ? "Muscle" : "Exercise"} to identify">`
    : `<div class="chip">${escapeHtml(q.topic)}</div>
       <p class="stem">${escapeHtml(q.question)}</p>`;
  const choicesHtml = q.choices
    .map((choice, i) => {
      let cls = "choice";
      if (state.revealed) {
        if (i === q.answerIndex) cls += " is-correct";
        else if (i === state.selected) cls += " is-wrong";
      } else if (i === state.selected) {
        cls += " is-selected";
      }
      return `<button class="${cls}" data-action="select" data-index="${i}" ${
        state.revealed ? "disabled" : ""
      }>${escapeHtml(choice)}</button>`;
    })
    .join("");

  const actionHtml = state.revealed
    ? `<div class="explanation" aria-live="polite">${escapeHtml(q.explanation)}</div>
       <button class="primary mt-1" data-action="continue">Continue</button>`
    : `<button class="primary" data-action="confirm" ${
        state.selected === null ? "disabled" : ""
      }>Confirm</button>`;

  app.innerHTML = `
    <div class="progress-count">${state.index + 1}/${SESSION_SIZE}</div>
    <div class="card">
      ${promptHtml}
      <div class="choices">${choicesHtml}</div>
      ${actionHtml}
    </div>
  `;
}

function renderResults() {
  const missesHtml = state.misses.length
    ? state.misses
        .map(
          (m) => `
        <div class="miss">
          <p class="miss-stem">${escapeHtml((m.q.source === "exercises" || m.q.source === "muscles") ? m.q.choices[m.q.answerIndex] : m.q.question)}</p>
          <p class="muted">${escapeHtml(m.q.explanation)}</p>
        </div>
      `
        )
        .join("")
    : `<p class="muted">Perfect session, no misses.</p>`;

  app.innerHTML = `
    <h2>Session complete</h2>
    <p class="score">${state.score}/${SESSION_SIZE}</p>
    <div class="card">${missesHtml}</div>
    <div class="stack mt-1">
      <button class="primary" data-action="another">Another ${SESSION_SIZE}</button>
      <button data-action="home">Home</button>
    </div>
  `;
}

function renderError() {
  app.innerHTML = `
    <div class="card error-box stack">
      <p>Could not load questions. Use GitHub Pages or run <code>python3 -m http.server</code> from the repo root.</p>
      <button class="primary" data-action="retry">Retry</button>
    </div>
  `;
}

function render() {
  if (state.screen === "home") return renderHome();
  if (state.screen === "quiz") return renderQuiz();
  if (state.screen === "results") return renderResults();
  if (state.screen === "error") return renderError();
}

function startSession() {
  const pool = filterPool(questions, state.sourceFilter);
  if (pool.length < SESSION_SIZE) return;
  state.session = state.sourceFilter === "mixed"
    ? pickMixedSession(questions, progress.questions, SESSION_SIZE, Math.random)
    : pickSession(pool, progress.questions, SESSION_SIZE, Math.random);
  state.index = 0;
  state.selected = null;
  state.revealed = false;
  state.misses = [];
  state.score = 0;
  progress = { ...progress, lastSource: state.sourceFilter };
  safeSaveProgress(progress);
  state.screen = "quiz";
  render();
}

function confirmAnswer() {
  if (state.revealed || state.selected === null) return;
  const q = state.session[state.index];
  const correct = state.selected === q.answerIndex;
  if (correct) {
    state.score += 1;
  } else {
    state.misses.push({ q, chosen: state.selected });
  }
  progress = recordAnswer(progress, q.id, correct, Date.now());
  state.revealed = true;
  safeSaveProgress(progress);
  render();
}

function continueNext() {
  if (!state.revealed) return;
  if (state.index + 1 < state.session.length) {
    state.index += 1;
    state.selected = null;
    state.revealed = false;
    render();
    return;
  }
  progress = { ...progress, lastScore: state.score };
  safeSaveProgress(progress);
  state.screen = "results";
  render();
}

function resetProgress() {
  if (!window.confirm("Clear all local quiz progress?")) return;
  safeClearProgress();
  render();
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-source") {
    state.sourceFilter = target.dataset.source;
    render();
  } else if (action === "start") {
    startSession();
  } else if (action === "reset") {
    resetProgress();
  } else if (action === "select") {
    if (state.revealed) return;
    state.selected = Number(target.dataset.index);
    render();
  } else if (action === "confirm") {
    confirmAnswer();
  } else if (action === "continue") {
    continueNext();
  } else if (action === "another") {
    startSession();
  } else if (action === "home") {
    state.screen = "home";
    render();
  } else if (action === "retry") {
    boot();
  }
});

window.addEventListener("keydown", (event) => {
  if (state.screen !== "quiz") return;
  const q = state.session[state.index];
  if (!q) return;

  if (!state.revealed && event.key >= "1" && event.key <= "4") {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const idx = Number(event.key) - 1;
    if (idx < q.choices.length) {
      state.selected = idx;
      render();
    }
    return;
  }

  if (event.key === "Enter") {
    if (event.target.closest("[data-action]")) return;
    if (!state.revealed) {
      if (state.selected !== null) confirmAnswer();
    } else {
      continueNext();
    }
  }
});

boot();
