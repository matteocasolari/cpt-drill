import {
  SESSION_SIZE,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  PREVIOUS_STORAGE_KEYS,
  filterPool,
  pickSession,
  pickMixedSession,
  loadProgress,
  saveProgress,
  recordAnswer,
  normalizeBank,
  emptyProgress,
  createSessionSummary,
  recordSession,
  calculateAnalytics,
  createBackup,
  parseBackup,
  mergeProgress,
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
    storage.removeItem(LEGACY_STORAGE_KEY);
    PREVIOUS_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
  } catch {
    warnStorageOnce("Could not clear progress from localStorage.");
  }
}

let questions = [];
let progress = safeLoadProgress();

const state = {
  screen: "home", // "home" | "quiz" | "results" | "progress" | "error"
  sourceFilter: "mixed",
  session: [],
  index: 0,
  selections: [],
  responses: [],
  score: 0,
  confirmFinish: false,
  sessionSaved: false,
  progressMessage: null,
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

function questionCategory(source) {
  return ({
    nasm: "NASM",
    nsca: "NSCA",
    both: "NASM + NSCA",
    nutrition: "Nutrition",
    exercises: "Exercises",
    muscles: "Muscles",
    equipment: "Equipment",
    movements: "Movements",
  })[source] || source;
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
      <header class="home-header">
        <div>
          <h1>CPT Drill</h1>
          ${lastScoreLine}
        </div>
        <button class="progress-shortcut" data-action="progress" aria-label="View progress">
          <svg class="progress-shortcut-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19V10M10 19V5M16 19v-7M22 19V2" />
            <path d="M2 19h20" />
          </svg>
          <span>Progress</span>
        </button>
      </header>
      <div class="source-group" role="group" aria-label="Question source">
        ${sourceButton("mixed", "Mixed")}
        ${sourceButton("nasm", "NASM")}
        ${sourceButton("nsca", "NSCA")}
        ${sourceButton("nutrition", "Nutrition")}
        ${sourceButton("exercises", "Exercises")}
        ${sourceButton("muscles", "Muscles")}
        ${sourceButton("equipment", "Equipment")}
        ${sourceButton("movements", "Movements")}
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
  const response = state.responses[state.index];
  const selected = response ? response.chosen : state.selections[state.index];
  const revealed = Boolean(response);
  const answeredCount = state.responses.filter(Boolean).length;
  const correctCount = state.responses.filter((item) => item && item.correct).length;
  const imageQuestion = ["exercises", "muscles", "equipment", "movements"].includes(q.source);
  const questionMetaHtml = `
    <div class="question-meta">
      <div class="chip chip-category">${escapeHtml(questionCategory(q.source))}</div>
      <div class="chip">${escapeHtml(q.topic)}</div>
    </div>`;
  const promptHtml = imageQuestion
    ? `${questionMetaHtml}
       <img class="quiz-image" src="${escapeHtml(q.image)}" alt="${q.source === "muscles" ? "Muscle" : q.source === "equipment" ? "Gym equipment" : q.source === "movements" ? "Movement" : "Exercise"} to identify">`
    : `${questionMetaHtml}
       <p class="stem">${escapeHtml(q.question)}</p>`;
  const choicesHtml = q.choices
    .map((choice, i) => {
      let cls = "choice";
      if (revealed) {
        if (i === q.answerIndex) cls += " is-correct";
        else if (i === selected) cls += " is-wrong";
      } else if (i === selected) {
        cls += " is-selected";
      }
      return `<button class="${cls}" data-action="select" data-index="${i}" ${
        revealed ? "disabled" : ""
      }>${escapeHtml(choice)}</button>`;
    })
    .join("");

  const actionHtml = revealed
    ? `<div class="explanation" aria-live="polite">${escapeHtml(q.explanation)}</div>
       <button class="primary mt-1" data-action="continue">${state.index + 1 < state.session.length ? "Next question" : "Finish session"}</button>`
    : `<button class="primary" data-action="confirm" ${
        selected === null ? "disabled" : ""
      }>Confirm</button>`;
  const unansweredCount = state.session.length - answeredCount;
  const finishPromptHtml = state.confirmFinish
    ? `<div class="finish-prompt" role="dialog" aria-modal="true" aria-labelledby="finish-title">
         <div class="card stack">
           <div>
             <h2 id="finish-title">${unansweredCount} unanswered ${unansweredCount === 1 ? "question" : "questions"}</h2>
             <p class="finish-copy">Would you like to finish now or go back and answer the missing ${unansweredCount === 1 ? "one" : "ones"}?</p>
           </div>
           <button class="primary" data-action="fill-missing">Go back to missing questions</button>
           <button data-action="finish-anyway">Finish anyway</button>
         </div>
       </div>`
    : "";

  app.innerHTML = `
    <div class="quiz-toolbar">
      <button data-action="previous" ${state.index === 0 ? "disabled" : ""} aria-label="Previous question">← Previous</button>
      <div class="progress-count">${state.index + 1}/${state.session.length}<span>${answeredCount} answered · ${correctCount} correct</span></div>
      ${state.index + 1 === state.session.length
        ? `<button data-action="finish" aria-label="Finish session">Finish</button>`
        : `<button data-action="next" aria-label="Next question">Next →</button>`}
    </div>
    <div class="card">
      ${promptHtml}
      <div class="choices">${choicesHtml}</div>
      ${actionHtml}
    </div>
    ${finishPromptHtml}
  `;
}

function renderResults() {
  const reviewItems = state.session.flatMap((q, index) => {
    const response = state.responses[index];
    if (!response) return [{ q, skipped: true }];
    return response.correct ? [] : [{ q, chosen: response.chosen, skipped: false }];
  });
  const missesHtml = reviewItems.length
    ? reviewItems
        .map(
          (m) => `
        <div class="miss">
          <p class="miss-stem">${escapeHtml(["exercises", "muscles", "equipment", "movements"].includes(m.q.source) ? m.q.choices[m.q.answerIndex] : m.q.question)}</p>
          <p class="answer-summary">${m.skipped ? "Skipped" : `Your answer: ${escapeHtml(m.q.choices[m.chosen])}`} · Correct answer: ${escapeHtml(m.q.choices[m.q.answerIndex])}</p>
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
      <button class="progress-result-link" data-action="progress">See progress →</button>
      <button data-action="home">Home</button>
    </div>
  `;
}

function formatAccuracy(value) {
  return value === null ? "—" : `${value}%`;
}

function trendCopy(trend) {
  if (trend.direction === "insufficient") return "Complete at least two sessions to see a trend.";
  if (trend.direction === "flat") return "Your recent average is holding steady.";
  return `Your recent average is ${trend.direction === "up" ? "up" : "down"} ${Math.abs(trend.change)} percentage ${Math.abs(trend.change) === 1 ? "point" : "points"}.`;
}

function renderTrendChart(series) {
  const points = series.slice(-30);
  if (!points.length) return `<div class="chart-empty muted">Your completed sessions will appear here.</div>`;
  const width = 600;
  const height = 190;
  const pad = 24;
  const x = (index) => points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - ((value || 0) / 100) * (height - pad * 2);
  const coordinates = points.map((point, index) => `${x(index)},${y(point.accuracy)}`).join(" ");
  const dots = points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.accuracy)}" r="4"><title>${formatAccuracy(point.accuracy)} · ${new Date(point.completedAt).toLocaleDateString()}</title></circle>`).join("");
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Session accuracy over time">
    <line x1="${pad}" y1="${y(100)}" x2="${width - pad}" y2="${y(100)}" />
    <line x1="${pad}" y1="${y(50)}" x2="${width - pad}" y2="${y(50)}" />
    <line x1="${pad}" y1="${y(0)}" x2="${width - pad}" y2="${y(0)}" />
    <polyline points="${coordinates}" />${dots}
  </svg>`;
}

function renderProgress() {
  const analytics = calculateAnalytics(progress.sessions);
  const sourceRows = analytics.sources.map((item) => `
    <div class="source-stat">
      <div class="source-stat-heading"><strong>${escapeHtml(item.label)}</strong><span>${formatAccuracy(item.accuracy)}</span></div>
      <div class="performance-bar" role="meter" aria-label="${escapeHtml(item.label)} accuracy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.accuracy || 0}"><span style="width:${item.accuracy || 0}%"></span></div>
      <div class="muted stat-detail">${item.attempted ? `${item.correct} of ${item.attempted} correct` : "No attempts yet"}</div>
    </div>`).join("");
  const topicRows = analytics.topics.map((item) => `
    <tr><th scope="row">${escapeHtml(item.topic)}</th><td>${formatAccuracy(item.accuracy)}</td><td>${item.correct}/${item.attempted}</td></tr>`).join("");
  const message = state.progressMessage
    ? `<p class="data-message ${state.progressMessage.type === "error" ? "is-error" : "is-success"}" role="status">${escapeHtml(state.progressMessage.text)}</p>`
    : "";

  app.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Your training</p><h1>Progress</h1></div><button data-action="home">← Home</button></div>
    <section class="dashboard-grid" aria-label="Overall performance">
      <div class="metric-card"><span>Accuracy</span><strong>${formatAccuracy(analytics.overall.accuracy)}</strong></div>
      <div class="metric-card"><span>Sessions</span><strong>${analytics.overall.sessions}</strong></div>
      <div class="metric-card"><span>Answered</span><strong>${analytics.overall.attempted}</strong></div>
      <div class="metric-card"><span>Correct</span><strong>${analytics.overall.correct}</strong></div>
    </section>
    <section class="dashboard-section card"><div class="section-heading"><div><p class="eyebrow">Last 30 sessions</p><h2>Accuracy over time</h2></div></div>${renderTrendChart(analytics.series)}<p class="trend-summary">${escapeHtml(trendCopy(analytics.trend))}</p></section>
    <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">Main view</p><h2>Performance by source</h2></div></div><div class="source-stats">${sourceRows}</div></section>
    <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">Weakest first</p><h2>Performance by topic</h2></div></div>
      ${topicRows ? `<div class="topic-table-wrap"><table class="topic-table"><thead><tr><th>Topic</th><th>Accuracy</th><th>Correct</th></tr></thead><tbody>${topicRows}</tbody></table></div>` : `<div class="card muted">Complete a session to unlock your topic breakdown.</div>`}
    </section>
    <section class="dashboard-section card data-controls"><div><h2>Keep a backup</h2><p class="muted">Progress lives only in this browser. Export a JSON file before clearing browser data or moving devices.</p></div>
      <div class="data-actions"><button data-action="export">Export backup</button><button data-action="choose-import">Import backup</button></div>
      <input class="visually-hidden" id="import-file" type="file" accept="application/json,.json" />${message}
    </section>`;
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
  if (state.screen === "progress") return renderProgress();
  if (state.screen === "error") return renderError();
}

function startSession() {
  const pool = filterPool(questions, state.sourceFilter);
  if (pool.length < SESSION_SIZE) return;
  state.session = state.sourceFilter === "mixed"
    ? pickMixedSession(questions, progress.questions, SESSION_SIZE, Math.random)
    : pickSession(pool, progress.questions, SESSION_SIZE, Math.random);
  state.index = 0;
  state.selections = Array(state.session.length).fill(null);
  state.responses = Array(state.session.length).fill(null);
  state.score = 0;
  state.confirmFinish = false;
  state.sessionSaved = false;
  progress = { ...progress, lastSource: state.sourceFilter };
  safeSaveProgress(progress);
  state.screen = "quiz";
  render();
}

function confirmAnswer() {
  if (state.responses[state.index] || state.selections[state.index] === null) return;
  const q = state.session[state.index];
  const chosen = state.selections[state.index];
  const correct = chosen === q.answerIndex;
  if (correct) {
    state.score += 1;
  }
  progress = recordAnswer(progress, q.id, correct, Date.now());
  state.responses[state.index] = { chosen, correct };
  safeSaveProgress(progress);
  render();
}

function continueNext() {
  if (!state.responses[state.index]) return;
  if (state.index + 1 < state.session.length) {
    state.index += 1;
    render();
    return;
  }
  requestFinish();
}

function requestFinish() {
  const firstMissing = state.responses.findIndex((response) => !response);
  if (firstMissing !== -1) {
    state.confirmFinish = true;
    render();
    return;
  }
  finishSession();
}

function finishSession() {
  state.confirmFinish = false;
  if (!state.sessionSaved) {
    const session = createSessionSummary({
      completedAt: Date.now(),
      mode: state.sourceFilter,
      questions: state.session,
      responses: state.responses,
    });
    progress = recordSession({ ...progress, lastScore: state.score }, session);
    state.sessionSaved = true;
  }
  safeSaveProgress(progress);
  state.screen = "results";
  render();
}

function exportProgress() {
  const json = JSON.stringify(createBackup(progress), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cpt-drill-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.progressMessage = { type: "success", text: "Backup exported." };
  render();
}

async function importProgress(file) {
  try {
    if (!file || file.size > 2 * 1024 * 1024) throw new Error("Backup file is too large.");
    const backup = parseBackup(await file.text());
    progress = mergeProgress(progress, backup.progress);
    safeSaveProgress(progress);
    state.progressMessage = { type: "success", text: "Backup imported and merged." };
  } catch (error) {
    state.progressMessage = { type: "error", text: error instanceof Error ? error.message : "Could not import this backup." };
  }
  render();
}

function navigateQuestion(direction) {
  const nextIndex = state.index + direction;
  if (nextIndex < 0 || nextIndex >= state.session.length) return;
  state.confirmFinish = false;
  state.index = nextIndex;
  render();
}

function fillMissingQuestions() {
  const firstMissing = state.responses.findIndex((response) => !response);
  state.confirmFinish = false;
  if (firstMissing !== -1) state.index = firstMissing;
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
    if (state.responses[state.index]) return;
    state.selections[state.index] = Number(target.dataset.index);
    render();
  } else if (action === "confirm") {
    confirmAnswer();
  } else if (action === "continue") {
    continueNext();
  } else if (action === "previous") {
    navigateQuestion(-1);
  } else if (action === "next") {
    navigateQuestion(1);
  } else if (action === "finish") {
    requestFinish();
  } else if (action === "fill-missing") {
    fillMissingQuestions();
  } else if (action === "finish-anyway") {
    finishSession();
  } else if (action === "another") {
    startSession();
  } else if (action === "home") {
    state.screen = "home";
    state.progressMessage = null;
    render();
  } else if (action === "progress") {
    state.screen = "progress";
    state.progressMessage = null;
    render();
  } else if (action === "export") {
    exportProgress();
  } else if (action === "choose-import") {
    document.getElementById("import-file")?.click();
  } else if (action === "retry") {
    boot();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id !== "import-file") return;
  importProgress(event.target.files && event.target.files[0]);
});

window.addEventListener("keydown", (event) => {
  if (state.screen !== "quiz") return;
  if (state.confirmFinish) {
    if (event.key === "Escape") fillMissingQuestions();
    return;
  }
  const q = state.session[state.index];
  if (!q) return;

  const response = state.responses[state.index];
  if (!response && event.key >= "1" && event.key <= "4") {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const idx = Number(event.key) - 1;
    if (idx < q.choices.length) {
      state.selections[state.index] = idx;
      render();
    }
    return;
  }

  if (event.key === "Enter") {
    if (event.target.closest("[data-action]")) return;
    if (!response) {
      if (state.selections[state.index] !== null) confirmAnswer();
    } else {
      continueNext();
    }
  }
});

boot();
