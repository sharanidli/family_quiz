// =============================================================
// Not Such A Tough Quiz Also
// Family-friendly India quiz with voice host + listen-and-judge
// =============================================================

const THEME_OPTIONS = [
  { id: 'cricket',     label: 'Cricket' },
  { id: 'cinema',      label: 'Cinema & Bollywood' },
  { id: 'history',     label: 'History & Freedom' },
  { id: 'geography',   label: 'Geography' },
  { id: 'business',    label: 'Business & Brands' },
  { id: 'polity',      label: 'Polity & Constitution' },
  { id: 'south_india', label: 'South India' },
  { id: 'languages',   label: 'Languages & Literature' },
  { id: 'current_affairs', label: 'Current Affairs (this decade)' },
  { id: 'personalities',   label: 'Personalities' },
];

// Theme options shown when Iranian Mode is on. Picker filters out everything India-specific.
const IRANIAN_THEME_OPTIONS = [
  { id: 'world',              label: 'World / International' },
  { id: 'usa',                label: 'USA' },
  { id: 'etymology',          label: 'Word Origins' },
  { id: 'india_iran_bridge',  label: 'India ↔ Iran' },
];

// In Iranian Mode, only questions tagged with these themes are eligible.
// `iran_only` is further restricted to players in IRANIAN_PLAYERS below.
const IRANIAN_MODE_THEMES = ['iran_only', 'india_iran_bridge', 'world', 'usa', 'etymology'];
const IRANIAN_MODE_NON_IRANIAN_THEMES = ['india_iran_bridge', 'world', 'usa', 'etymology'];

// Iranian player names (case-insensitive). Only these players can be served `iran_only`
// questions. Other players in the game get bridge/world/usa/etymology only.
const IRANIAN_PLAYERS = ['telli', 'taymaz'];

function isIranianPlayer(player) {
  if (!player) return false;
  return IRANIAN_PLAYERS.includes((player.name || '').trim().toLowerCase());
}

function currentThemeOptions() {
  return state.iranianMode ? IRANIAN_THEME_OPTIONS : THEME_OPTIONS;
}

const TIMER_SECONDS = 120;

// Joy's Postcard — rotating openers the host says before each Long/Theme question
const JOY_OPENERS = [
  "Picture this.",
  "Now then.",
  "On a balmy afternoon, somewhere in our subcontinent.",
  "Cast your mind back.",
  "Here's one for you.",
  "Settle in for a moment.",
  "Across the years.",
  "From the dusty by-lanes of memory.",
  "Listen carefully.",
  "And now.",
  "A small puzzle, this one.",
  "Try this on for size.",
];

// ----- State -----
const state = {
  players: [],
  rounds: [],
  currentRoundIdx: 0,
  questionInRound: 0,
  currentPlayerIdx: 0,
  anchorIdx: -1,              // infinite bounce: seat of the last correct answerer; next Q starts at anchorIdx+1
  originalPlayerIdx: null,    // seat the current question was first asked to
  connectClueIdx: 0,          // which Connect clue is currently revealed
  pouncerIdx: null,           // seat that pounced (Pounce & Bounce)
  questions: [],
  activeQuestions: [],        // the questions in play this game after the source filter (all/new/mainly)
  questionSource: 'full',     // 'full' | 'new' | 'mainly'
  pool: { byTopic: {}, byTheme: {}, connect: [], all: [] },
  used: new Set(),
  phase: 'setup',
  currentQuestion: null,
  currentBid: 0,
  voiceHost: true,
  autoJudge: true,
  timerEnabled: false,
  avoidRepeats: true,
  iranianMode: false,
  voiceRate: 1.15,
  listening: false,
  recognition: null,
  heard: '',
  matchAnnounced: false,
  partySeen: new Set(),
};

let timerInterval = null;
let timerSecondsLeft = 0;

// ----- DOM helpers -----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const el = (tag, props = {}, children = []) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return e;
};

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + name + '-screen').classList.add('active');
}

// ----- Setup rendering -----
function renderPlayers() {
  const list = $('#player-list');
  list.innerHTML = '';
  state.players.forEach((p, i) => {
    const row = el('div', { class: 'player-row' }, [
      el('input', {
        type: 'text', value: p.name, placeholder: 'Player ' + (i + 1),
        oninput: (e) => { p.name = e.target.value; updatePartyHint(); },
      }),
      el('button', {
        class: 'remove',
        title: 'Remove',
        onclick: () => { state.players.splice(i, 1); renderPlayers(); updatePartyHint(); }
      }, '×'),
    ]);
    list.appendChild(row);
  });
  updatePartyHint();
}

function addPlayer() {
  state.players.push({ id: Date.now() + Math.random(), name: '', score: 0, log: [] });
  renderPlayers();
  const inputs = $$('#player-list input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function renderRounds() {
  const list = $('#round-list');
  list.innerHTML = '';
  state.rounds.forEach((r, i) => {
    const cells = [el('div', { class: 'label' }, roundLabel(r))];

    if (r.type === 'theme') {
      const themeOpts = currentThemeOptions();
      // If the round's theme isn't in the current option set (e.g. mode just toggled),
      // snap to the first available theme to keep the round playable.
      if (!themeOpts.some(o => o.id === r.theme)) r.theme = themeOpts[0].id;
      const sel = el('select', {
        onchange: (e) => { r.theme = e.target.value; },
      });
      themeOpts.forEach(opt => {
        const o = el('option', { value: opt.id }, opt.label);
        if (opt.id === r.theme) o.selected = true;
        sel.appendChild(o);
      });
      cells.push(sel);
    } else {
      cells.push(el('span'));
    }

    const countLabel = (r.type === 'theme' || r.type === 'connect') ? 'questions' : 'per player';
    cells.push(el('input', {
      type: 'number', min: 1, max: 20, value: r.count,
      title: countLabel,
      oninput: (e) => { r.count = Math.max(1, parseInt(e.target.value) || 1); },
    }));

    cells.push(el('button', {
      class: 'remove',
      title: 'Remove round',
      onclick: () => { state.rounds.splice(i, 1); renderRounds(); }
    }, '×'));

    // Pounce & Bounce toggle — full-width sub-row. Not offered for Connect (it is
    // already a buzzer format) or single-player games.
    if (r.type !== 'connect') {
      const pounceLabel = el('label', { class: 'pounce-toggle', style: 'grid-column: 1 / -1;' });
      const cb = el('input', {
        type: 'checkbox',
        onchange: (e) => { r.pounce = e.target.checked; },
      });
      if (r.pounce) cb.checked = true;
      pounceLabel.appendChild(cb);
      pounceLabel.appendChild(document.createTextNode(' Pounce & Bounce (+1× if right, −2× if wrong)'));
      cells.push(pounceLabel);
    }

    list.appendChild(el('div', { class: 'round-row' }, cells));
  });
}

function roundLabel(r) {
  if (r.type === 'long')    return 'Long Question';
  if (r.type === 'theme')   return 'Theme Round';
  if (r.type === 'bid')     return 'Bid Round';
  if (r.type === 'connect') return 'Connect';
  return r.type;
}

function addRound(type) {
  const defaults = {
    long:    { type: 'long',    count: 2 },
    theme:   { type: 'theme',   count: 6, theme: 'cricket' },
    bid:     { type: 'bid',     count: 1 },
    connect: { type: 'connect', count: 3 },
  };
  state.rounds.push({ ...defaults[type] });
  renderRounds();
}

// ----- Question pool -----
function buildPool() {
  buildActiveQuestions();
  state.pool.byTopic = {};
  state.pool.byTheme = {};
  state.pool.connect = [];
  // Theme rounds and Connect draw from the FULL bank (source-agnostic), so a themed or
  // connect round can use older / yesterday's questions even when "All new" is selected.
  state.questions.forEach(q => {
    if (q.callback) return;                 // callbacks feed the end-game Long Tail only
    if (q.connect) { state.pool.connect.push(q); return; }  // connects feed Connect rounds only
    const t = q.topic;
    if (!state.pool.byTopic[t]) state.pool.byTopic[t] = [];
    state.pool.byTopic[t].push(q);
    if (Array.isArray(q.themes)) {
      for (const th of q.themes) {
        if (!state.pool.byTheme[th]) state.pool.byTheme[th] = [];
        state.pool.byTheme[th].push(q);
      }
    }
  });
  Object.values(state.pool.byTopic).forEach(arr => shuffle(arr));
  Object.values(state.pool.byTheme).forEach(arr => shuffle(arr));
  shuffle(state.pool.connect);
  // Long Question / Bid rounds respect the "Question set" selector (All new / Mainly / Full).
  state.pool.all = shuffle(state.activeQuestions.filter(q => !q.callback && !q.connect));
}

// Combine questions matching a theme key by either `topic` or `themes`
function poolForTheme(key) {
  const a = state.pool.byTopic[key] || [];
  const b = state.pool.byTheme[key] || [];
  if (!b.length) return a;
  if (!a.length) return b;
  const seen = new Set();
  const out = [];
  for (const q of a) { if (!seen.has(q.id)) { seen.add(q.id); out.push(q); } }
  for (const q of b) { if (!seen.has(q.id)) { seen.add(q.id); out.push(q); } }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// When Iranian Mode is on, restricts the question pool to the Iranian-mode themes,
// and further restricts `iran_only` to Telli/Taymaz turns.
function iranianModeFilter() {
  if (!state.iranianMode) return null;
  const allowed = isIranianPlayer(state.players[state.currentPlayerIdx])
    ? IRANIAN_MODE_THEMES
    : IRANIAN_MODE_NON_IRANIAN_THEMES;
  return (q) => Array.isArray(q.themes) && q.themes.some(t => allowed.includes(t));
}

// ----- Question freshness / source selector -----
// "New" = the most recent generation batch (the latest `created` date among regular
// questions), and only if that batch is today or yesterday. Defining it as the *latest*
// batch — rather than a rolling 2-day window — means yesterday's set stops counting as
// "new" the moment you generate a fresh one today.
const NEW_MIN_ALL = 40;      // need at least this many new questions to allow "All new"
const NEW_MIN_MAINLY = 25;   // ...and this many to allow "Mainly new"
const CONNECT_POINTS = [15, 10, 5];  // points if the connection is got on clue 1 / 2 / 3

function localYMD(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function recentDateSet() {
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  return new Set([localYMD(today), localYMD(yest)]);
}

// The date of the latest regular-question batch, or null if that batch is older than
// yesterday (i.e., no fresh set — fall back to Full database).
function newBatchDate() {
  let latest = '';
  for (const q of state.questions) {
    if (q.callback || q.connect) continue;
    if (q.created && q.created > latest) latest = q.created;
  }
  return recentDateSet().has(latest) ? latest : null;
}
function isNewQuestion(q, batchDate) {
  return !!batchDate && q.created === batchDate && !q.callback && !q.connect;
}

// Count of new *playable* regular questions (callbacks and connects feed their own rounds).
function countNewRegular() {
  const d = newBatchDate();
  if (!d) return 0;
  return state.questions.filter(q => isNewQuestion(q, d)).length;
}

// Build the in-play set for this game based on the chosen source. Connects and callbacks
// are ALWAYS included (they feed their own rounds — Connect / end-game Long Tail — and are
// source-agnostic), so a Connect round works even in "All new".
function buildActiveQuestions() {
  const all = state.questions;
  const callbacks = all.filter(q => q.callback);
  const connects = all.filter(q => q.connect);
  if (state.questionSource === 'full' || state.iranianMode) {
    state.activeQuestions = all.slice();
    return;
  }
  const d = newBatchDate();
  const regs = all.filter(q => !q.callback && !q.connect);
  if (state.questionSource === 'new') {
    state.activeQuestions = regs.filter(q => isNewQuestion(q, d)).concat(connects, callbacks);
    return;
  }
  // 'mainly' — all new, plus ~1 old for every 3 new (≈ 3:1 blend), then connects + callbacks.
  const newQs = regs.filter(q => isNewQuestion(q, d));
  const oldQs = regs.filter(q => !isNewQuestion(q, d));
  shuffle(oldQs);
  const k = Math.round(newQs.length / 3);
  state.activeQuestions = newQs.concat(oldQs.slice(0, k), connects, callbacks);
}

function nextQuestion(opts = {}) {
  const { topic, bidEligible } = opts;
  const pool = topic ? poolForTheme(topic) : state.pool.all;
  const modeFilter = iranianModeFilter();

  // Pass 1: unused this game AND unseen by this party
  if (state.avoidRepeats) {
    for (const q of pool) {
      if (state.used.has(q.id)) continue;
      if (state.partySeen.has(q.id)) continue;
      if (bidEligible && !q.bid_eligible) continue;
      if (modeFilter && !modeFilter(q)) continue;
      state.used.add(q.id);
      return q;
    }
  }
  // Pass 2: unused this game (allow repeats from history if needed)
  for (const q of pool) {
    if (state.used.has(q.id)) continue;
    if (bidEligible && !q.bid_eligible) continue;
    if (modeFilter && !modeFilter(q)) continue;
    state.used.add(q.id);
    return q;
  }
  // Pass 3: relax bid filter
  if (bidEligible) {
    for (const q of pool) {
      if (state.used.has(q.id)) continue;
      if (modeFilter && !modeFilter(q)) continue;
      state.used.add(q.id);
      return q;
    }
  }
  // Pass 4: any unused, any topic — still honour the mode filter so we never
  // serve an India-specific question in Iranian Mode.
  for (const q of state.activeQuestions) {
    if (q.callback || q.connect) continue;
    if (state.used.has(q.id)) continue;
    if (modeFilter && !modeFilter(q)) continue;
    state.used.add(q.id);
    return q;
  }
  return null;
}

// ----- Per-player history (localStorage) -----
// Each player has their own seen-set keyed by lowercase name.
// The session's "exclude" set is the union of all current players' individual sets.
// After each game, the session's questions are added to EACH current player's set,
// so a returning player carries their history into any future group they join.

const PLAYER_KEY_PREFIX = 'quiz_player_seen_';

function getPlayerKey(name) {
  const norm = (name || '').trim().toLowerCase();
  return norm ? PLAYER_KEY_PREFIX + norm : null;
}

function loadPlayerSeen(name) {
  const key = getPlayerKey(name);
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) { return new Set(); }
}

function savePlayerSeenSet(name, set) {
  const key = getPlayerKey(name);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) {}
}

function loadAllPlayersSeen() {
  // Union of every currently-listed player's individual seen-set
  const union = new Set();
  state.players.forEach(p => {
    const name = (p.name || '').trim();
    if (!name) return;
    loadPlayerSeen(name).forEach(qid => union.add(qid));
  });
  return union;
}

function persistSessionToPlayers() {
  // Add every question used this session to each named player's history
  const newQs = [...state.used];
  state.players.forEach(p => {
    const name = (p.name || '').trim();
    if (!name) return;
    const set = loadPlayerSeen(name);
    newQs.forEach(qid => set.add(qid));
    savePlayerSeenSet(name, set);
  });
}

function resetPlayerSeen(name) {
  const key = getPlayerKey(name);
  if (!key) return;
  try { localStorage.removeItem(key); } catch (e) {}
  state.partySeen = loadAllPlayersSeen();  // recompute union without this player's data
  updatePartyHint();
}

// One-time migration from the old whole-party storage scheme to per-player.
// Old keys: `quiz_seen_alice|bob|carol`  →  individual `quiz_player_seen_alice`, etc.
function migrateLegacyHistoryKeys() {
  const migrated = [];
  const oldKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('quiz_seen_') && !k.startsWith(PLAYER_KEY_PREFIX)) {
      oldKeys.push(k);
    }
  }
  oldKeys.forEach(k => {
    let ids;
    try { ids = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return; }
    if (!Array.isArray(ids) || !ids.length) {
      localStorage.removeItem(k);
      return;
    }
    const names = k.replace('quiz_seen_', '').split('|').map(s => s.trim()).filter(Boolean);
    names.forEach(name => {
      const set = loadPlayerSeen(name);
      ids.forEach(qid => set.add(qid));
      savePlayerSeenSet(name, set);
    });
    localStorage.removeItem(k);
    migrated.push({ key: k, names, count: ids.length });
  });
  if (migrated.length) {
    console.log(`Migrated ${migrated.length} legacy party-history key(s) to per-player.`);
  }
}

function updatePartyHint() {
  const hint = $('#party-hint');
  if (!hint) return;
  const names = state.players.map(p => (p.name || '').trim()).filter(n => n);
  if (!names.length) { hint.innerHTML = ''; return; }

  // Build per-player chips
  const parts = names.map(name => {
    const safe = name.replace(/</g, '&lt;');
    const seen = loadPlayerSeen(name);
    if (seen.size === 0) {
      return `<span class="player-history-chip new"><strong>${safe}</strong>: <em>new</em></span>`;
    }
    return `<span class="player-history-chip">
      <strong>${safe}</strong>: ${seen.size} seen
      <a href="#" class="reset-link" data-name="${safe}">reset</a>
    </span>`;
  });

  hint.innerHTML = parts.join(' · ');

  hint.querySelectorAll('.reset-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const name = a.dataset.name;
      if (confirm(`Forget all questions "${name}" has seen? They will be eligible again.`)) {
        resetPlayerSeen(name);
      }
    });
  });
}

// ----- Timer -----
function startTimer() {
  if (!state.timerEnabled) return;
  clearTimer();
  timerSecondsLeft = TIMER_SECONDS;
  renderTimer();
  timerInterval = setInterval(() => {
    timerSecondsLeft--;
    renderTimer();
    if (timerSecondsLeft <= 0) {
      clearTimer();
      onTimerExpire();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const t = $('#timer');
  if (t) { t.classList.remove('warn', 'danger', 'expired'); }
}

function renderTimer() {
  const t = $('#timer');
  if (!t) return;
  const m = Math.floor(timerSecondsLeft / 60);
  const s = Math.max(0, timerSecondsLeft % 60);
  t.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  t.classList.toggle('warn',   timerSecondsLeft <= 30 && timerSecondsLeft > 10);
  t.classList.toggle('danger', timerSecondsLeft <= 10 && timerSecondsLeft > 0);
}

function onTimerExpire() {
  const t = $('#timer');
  if (t) {
    t.textContent = '⏱ Time!';
    t.classList.add('expired');
  }
  speak("Time's up.");
  stopListening();
}

// ----- Voice (TTS) -----
let preferredVoice = null;

function getAllVoices() {
  return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

// Normalise lang code: handle 'en-IN', 'en_IN', 'en-IN-x-foo' etc.
function isIndianEnglish(v) {
  if (!v) return false;
  const lang = (v.lang || '').replace('_', '-').toLowerCase();
  if (lang === 'en-in' || lang.startsWith('en-in-')) return true;
  // Some Android/iOS voices encode the locale only in the name
  if (/\b(india|indian|hindi)\b/i.test(v.name || '')) return true;
  // Common Indian-English voice names across OSes
  if (/\b(veena|rishi|heera|ravi|isha|prabhat|priya|aditi|kalpana|shruti)\b/i.test(v.name || '')) return true;
  return false;
}

function pickDefaultVoice(voices) {
  return voices.find(isIndianEnglish)
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
      || voices[0]
      || null;
}

function loadVoices() {
  const voices = getAllVoices();
  if (!voices.length) return;
  const saved = localStorage.getItem('quizVoiceURI');
  preferredVoice = (saved && voices.find(v => v.voiceURI === saved)) || pickDefaultVoice(voices);
  populateVoicePicker(voices);
  renderVoiceInfo(voices);
}

function populateVoicePicker(voices) {
  const select = $('#voice-select');
  if (!select) return;
  const indianVoices  = voices.filter(isIndianEnglish);
  const otherEn       = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en') && !isIndianEnglish(v));
  const otherVoices   = voices.filter(v => !v.lang || !v.lang.toLowerCase().startsWith('en'));
  select.innerHTML = '';
  const addOpt = (v, prefix = '') => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = prefix + `${v.name} (${v.lang})`;
    if (preferredVoice && v.voiceURI === preferredVoice.voiceURI) opt.selected = true;
    select.appendChild(opt);
  };
  if (indianVoices.length) {
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '— Indian English (recommended) —';
    select.appendChild(sep);
    indianVoices.forEach(v => addOpt(v));
  }
  if (otherEn.length) {
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '— other English —';
    select.appendChild(sep);
    otherEn.forEach(v => addOpt(v));
  }
  if (otherVoices.length) {
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '— other languages —';
    select.appendChild(sep);
    otherVoices.forEach(v => addOpt(v));
  }
}

function renderVoiceInfo(voices) {
  const info = $('#voice-info');
  if (!info) return;
  const indianCount = voices.filter(isIndianEnglish).length;
  const cur = preferredVoice ? `${preferredVoice.name} (${preferredVoice.lang})` : '(none)';
  const isIndian = isIndianEnglish(preferredVoice);
  let msg = `<span class="${isIndian ? 'good' : 'warn'}">Now using: <strong>${cur}</strong></span>`;
  msg += `<br><span class="muted small">${voices.length} voices available; ${indianCount} Indian English. `;
  if (!indianCount) {
    msg += `No Indian English voice on this device. <a href="#" id="install-voice-help">How to install one</a>`;
  }
  msg += `</span>`;
  info.innerHTML = msg;
  const help = $('#install-voice-help');
  if (help) help.addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      'No Indian English voice is installed on this device.\n\n' +
      'Android: Settings → System → Languages & input → Text-to-speech → ' +
      'Google → Install voice data → English (India). Reload this page after install.\n\n' +
      'iOS / iPhone: Settings → Accessibility → Spoken Content → Voices → English → ' +
      'choose English (India) and download "Veena" or "Rishi". Reload this page after.\n\n' +
      'Windows: Settings → Time & Language → Speech → Add voices → search "English (India)".\n\n' +
      'Until then, the host falls back to British / American English.'
    );
  });
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();
}

function speak(text, opts = {}) {
  return new Promise((resolve) => {
    if (!state.voiceHost || !window.speechSynthesis) { resolve(); return; }
    try {
      window.speechSynthesis.cancel();
      // Chrome's synth state stays "busy" for a tick after cancel(); if we call
      // speak(u) immediately, the new utterance is silently dropped about 80%
      // of the time. An 80ms gap is below the noticeable threshold but enough
      // to let cancel() settle. Without this, "Answer: …" and the end-of-game
      // winner line were both being swallowed.
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        if (preferredVoice) u.voice = preferredVoice;
        u.rate = opts.rate || state.voiceRate || 1.15;
        u.pitch = opts.pitch || 1;
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      }, 80);
    } catch (e) { resolve(); }
  });
}

function stopSpeaking() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

// ----- Mic (STT) -----
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'en-IN';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript + ' ';
    }
    state.heard = text.trim();
    onHeard(state.heard);
  };
  r.onerror = () => { /* swallow — onend will restart */ };
  r.onend = () => {
    if (state.listening) {
      try { r.start(); } catch (_) {}
    }
  };
  return r;
}

function startListening() {
  if (!state.autoJudge) return;
  if (!state.recognition) state.recognition = setupRecognition();
  if (!state.recognition) return;
  state.heard = '';
  state.listening = true;
  state.matchAnnounced = false;
  try { state.recognition.start(); } catch (_) {}
}

function stopListening() {
  state.listening = false;
  if (state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
  }
}

// ----- Fuzzy match -----
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an|of|and|to|in|by|is|was|are|were|sir|shri|mr|mrs|ms|dr)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatch(heard, accepted) {
  const h = normalize(heard);
  if (!h || !accepted || !accepted.length) return false;
  for (const a of accepted) {
    const n = normalize(a);
    if (!n) continue;
    if (h === n) return true;
    // Exact substring (full accepted phrase appears in heard)
    const padded = ' ' + h + ' ';
    if (padded.includes(' ' + n + ' ')) return true;
    if (n.includes(' ') && h.includes(n)) return true;
    // Single-word answer: tolerate small typos
    if (!n.includes(' ') && n.length >= 4) {
      for (const hw of h.split(' ')) {
        if (hw === n) return true;
        if (hw.length >= 4 && levenshtein(hw, n) <= Math.max(1, Math.floor(n.length * 0.2))) return true;
      }
    }
    // Multi-word answer: match if most key words appear (with small typo tolerance)
    if (n.includes(' ')) {
      const accWords = n.split(' ').filter(w => w.length >= 3);
      if (!accWords.length) continue;
      const heardWords = h.split(' ');
      let matched = 0;
      for (const aw of accWords) {
        for (const hw of heardWords) {
          if (hw === aw) { matched++; break; }
          if (aw.length >= 4 && hw.length >= 3 && levenshtein(hw, aw) <= 1) { matched++; break; }
        }
      }
      if (matched / accWords.length >= 0.65 && matched >= Math.min(2, accWords.length)) return true;
    }
  }
  return false;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function onHeard(text) {
  const ht = $('#heard-text');
  if (ht) {
    const labelEl = ht.querySelector('.heard-label');
    if (labelEl) labelEl.textContent = text || 'Listening...';
  }
  if (!state.matchAnnounced && state.currentQuestion) {
    if (fuzzyMatch(text, state.currentQuestion.accept)) {
      state.matchAnnounced = true;
      if (ht) {
        ht.classList.add('match');
        const labelEl = ht.querySelector('.heard-label');
        if (labelEl) labelEl.textContent = text + '   ✓ sounds right — click Right to confirm';
      }
      playChime();
      // Highlight the Right button so the host knows what to do
      const rightBtn = document.querySelector('.controls button.right');
      if (rightBtn) rightBtn.classList.add('pulse');
    }
  }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* ignore */ }
}

// Joy's Postcard cue — soft warm three-note arpeggio (C-E-G) that reads as a "stage curtain"
function playPostcardCue() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.18;
    masterGain.connect(ctx.destination);
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
      osc.connect(gain).connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  } catch (e) { /* ignore */ }
}

// ----- Game flow -----
function startGame() {
  state.players = state.players.filter(p => p.name.trim().length);
  if (!state.players.length) { alert('Add at least one player.'); return; }
  if (!state.rounds.length) { alert('Add at least one round.'); return; }

  state.players.forEach(p => { p.score = 0; p.log = []; });
  state.currentRoundIdx = 0;
  state.questionInRound = 0;
  state.currentPlayerIdx = 0;
  state.used.clear();
  state.partySeen = loadAllPlayersSeen();
  buildPool();

  // Prime TTS — some browsers require a user gesture before speech works
  if (state.voiceHost) speak(' ');

  showScreen('game');
  startRound();
}

async function startRound() {
  const r = state.rounds[state.currentRoundIdx];
  state.questionInRound = 0;
  state.currentPlayerIdx = 0;
  // Infinite bounce: control follows the correct answer. Seed the anchor one seat
  // back so the round's first question goes to player 0.
  state.anchorIdx = state.players.length - 1;
  state.phase = 'round-intro';
  renderHeader();

  const pounceNote = r.pounce ? ' Pounce & Bounce is on — anyone can pounce, but a wrong pounce costs double.' : '';
  let intro, spokenIntro;
  if (r.type === 'long') {
    intro = `Long Question round. ${r.count} question${r.count > 1 ? 's' : ''} per player. Get it right and the next question moves to the next person.` + pounceNote;
    spokenIntro = 'Long Question round.' + (r.pounce ? ' Pounce and bounce is on.' : '');
  } else if (r.type === 'theme') {
    const t = [...THEME_OPTIONS, ...IRANIAN_THEME_OPTIONS].find(t => t.id === r.theme);
    intro = `Theme round: ${t ? t.label : r.theme}. ${r.count} questions, control follows the correct answer.` + pounceNote;
    spokenIntro = `Theme round. ${t ? t.label : r.theme}.` + (r.pounce ? ' Pounce and bounce is on.' : '');
  } else if (r.type === 'connect') {
    intro = `Connect round. ${r.count} connection${r.count > 1 ? 's' : ''}. You get clue 1 — guess for 15, or pass to see clue 2 (10), then clue 3 (5). A wrong guess passes it on to the next person.`;
    spokenIntro = 'Connect round. Guess for more, or pass to see another clue. A wrong guess passes it on.';
  } else {
    intro = `Bid round. ${r.count} per player. Wager 5, 10, or 20 — right answer wins your wager, wrong loses it.` + pounceNote;
    spokenIntro = 'Bid round. Wager five, ten, or twenty.';
  }

  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, intro));
  main.appendChild(el('button', { class: 'big', onclick: nextQuestionInRound }, 'Begin Round →'));
  speak(spokenIntro);
}

async function nextQuestionInRound() {
  const r = state.rounds[state.currentRoundIdx];
  const playerCount = state.players.length;
  const total = (r.type === 'theme' || r.type === 'connect') ? r.count : r.count * playerCount;

  if (state.questionInRound >= total) return endRound();

  // Bid keeps its fixed rotation; Long / Theme / Connect use infinite bounce — control
  // starts one seat past whoever last answered correctly (state.anchorIdx).
  state.currentPlayerIdx = (r.type === 'bid')
    ? state.questionInRound % playerCount
    : (state.anchorIdx + 1) % playerCount;
  state.originalPlayerIdx = state.currentPlayerIdx;

  if (r.type === 'connect') return askConnect();
  if (r.type === 'bid') return askForBid();

  const q = (r.type === 'theme')
    ? (nextQuestion({ topic: r.theme }) || nextQuestion({}))
    : nextQuestion({});
  if (!q) { alert('Out of questions! Add more to questions.json.'); return endRound(); }

  state.currentQuestion = q;
  state.phase = 'question';
  renderQuestion(q);

  const playerName = state.players[state.currentPlayerIdx].name;
  await speak(playerName + '.');
  // Joy's Postcard — only for Long & Theme rounds (Bid has its own theatre via wager)
  if (r.type === 'long' || r.type === 'theme') {
    const opener = JOY_OPENERS[Math.floor(Math.random() * JOY_OPENERS.length)];
    playPostcardCue();
    await speak(opener);
  }
  await speak(q.question);
  startTimer();
  startListening();
}

function askForBid() {
  state.phase = 'bid-wager';
  state.currentBid = 0;
  const player = state.players[state.currentPlayerIdx];
  renderHeader();
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, `${player.name} — your wager?`));
  const row = el('div', { class: 'bid-buttons' });
  [5, 10, 20].forEach(v => {
    row.appendChild(el('button', {
      class: 'gold',
      onclick: async () => {
        state.currentBid = v;
        const q = nextQuestion({ bidEligible: true }) || nextQuestion({});
        if (!q) { alert('Out of questions!'); return endRound(); }
        state.currentQuestion = q;
        state.phase = 'question';
        renderQuestion(q, { bid: v });
        // Skip the redundant "you've wagered ten" — wager and question
        // already on screen. Go straight to the question.
        await speak(q.question);
        startListening();
      }
    }, '+' + v));
  });
  main.appendChild(row);
  speak(`${player.name} — your wager?`);
}

function renderHeader() {
  const r = state.rounds[state.currentRoundIdx];
  const ri = $('#round-info');
  if (r) {
    let label = `Round ${state.currentRoundIdx + 1} of ${state.rounds.length} • ${roundLabel(r)}`;
    if (r.type === 'theme') {
      const t = [...THEME_OPTIONS, ...IRANIAN_THEME_OPTIONS].find(t => t.id === r.theme);
      label += ` • ${t ? t.label : r.theme}`;
    }
    ri.textContent = label;
  } else {
    ri.textContent = '';
  }
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  const showActive = state.phase !== 'round-intro' && state.phase !== 'round-end';
  state.players.forEach((p, i) => {
    sb.appendChild(el('div', {
      class: 'score-chip' + (showActive && i === state.currentPlayerIdx ? ' active' : ''),
    }, `${p.name}: ${p.score}`));
  });
}

function renderQuestion(q, opts = {}) {
  renderHeader();
  const player = state.players[state.currentPlayerIdx];
  const main = $('#game-main');
  main.innerHTML = '';

  const headerEl = el('div', { class: 'player-up' });
  const headerBits = [player.name];
  if (opts.bid) headerBits.push(`Wager: ${opts.bid}`);
  if (opts.passing) headerBits.push('Bounce — full points');
  headerEl.appendChild(document.createTextNode(headerBits.join(' • ') + ' '));
  if (state.timerEnabled) {
    headerEl.appendChild(el('span', { id: 'timer', class: 'timer-chip' }, '⏱ 2:00'));
  }
  main.appendChild(headerEl);

  main.appendChild(el('div', { class: 'question-text' }, q.question));

  // Typed answer — always available; the reliable input
  main.appendChild(el('input', {
    type: 'text',
    class: 'typed-answer',
    id: 'typed-answer',
    placeholder: 'Or type your answer here…',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (e) => onTyped(e.target.value, e.target),
  }));

  if (state.autoJudge) {
    main.appendChild(el('div', { id: 'heard-text', class: 'heard-text' }, [
      el('span', { class: 'mic-indicator live' }),
      el('span', { class: 'heard-label' }, 'Listening…'),
    ]));
  }

  const ctrls = [
    el('button', { class: 'right', onclick: markRight }, '✓ Right'),
    el('button', { class: 'wrong', onclick: markWrong }, '✗ Wrong'),
  ];
  const _r = state.rounds[state.currentRoundIdx];
  const _canPass = (_r.type === 'long' || _r.type === 'theme') && state.players.length > 1;
  if (_canPass) {
    ctrls.push(el('button', { class: 'ghost', onclick: markPass }, 'Pass'));
  }
  // Pounce & Bounce — any live question in a pounce round; host taps who pounced.
  if (_r.pounce && state.players.length > 1) {
    ctrls.push(el('button', { class: 'gold pounce-btn', onclick: startPounce }, '⚡ Pounce'));
  }
  ctrls.push(el('button', { class: 'ghost', onclick: () => speak(q.question) }, '🔁 Repeat'));
  main.appendChild(el('div', { class: 'controls' }, ctrls));
}

// Typed-answer match — same fuzzy-match logic that the listener uses
function onTyped(text, inputEl) {
  if (state.matchAnnounced || !state.currentQuestion) return;
  if (fuzzyMatch(text, state.currentQuestion.accept)) {
    state.matchAnnounced = true;
    if (inputEl) inputEl.classList.add('match');
    playChime();
    const rightBtn = document.querySelector('.controls button.right');
    if (rightBtn) rightBtn.classList.add('pulse');
  }
}

// Push a single Q-outcome entry to the given player's log
function logEntry(player, outcome, points) {
  if (!state.currentQuestion) return;
  if (!Array.isArray(player.log)) player.log = [];
  const r = state.rounds[state.currentRoundIdx];
  player.log.push({
    qid: state.currentQuestion.id,
    qtext: state.currentQuestion.question || (state.currentQuestion.clues ? ('Connect → ' + state.currentQuestion.answer) : ''),
    answer: state.currentQuestion.answer,
    outcome,
    points,
    roundType: r ? r.type : 'long-tail',
  });
}

function markRight() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking(); clearTimer();
  const r = state.rounds[state.currentRoundIdx];
  const player = state.players[state.currentPlayerIdx];
  // Full points to whoever answers correctly — direct OR on a bounce. (A halved
  // bounce score unfairly penalised the seat after a weak player, who only ever
  // received that player's failed questions as bounces.)
  let pts = 10;
  if (r.type === 'bid') pts = state.currentBid;
  player.score += pts;
  logEntry(player, 'right', pts);
  // Infinite bounce: control now follows this player — next question starts to their left.
  if (r.type !== 'bid') state.anchorIdx = state.currentPlayerIdx;
  reveal('right');
}

function markWrong() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking(); clearTimer();
  const r = state.rounds[state.currentRoundIdx];
  const player = state.players[state.currentPlayerIdx];
  let pts = 0;
  if (r.type === 'bid') { pts = -state.currentBid; player.score += pts; }
  logEntry(player, 'wrong', pts);
  // Bid: wager already covers risk, no cascade.
  // Long / Theme: cascade to the next player like a Pass — they get a full-points chance.
  if (r.type === 'bid') return reveal('wrong');
  cascadeToNext('wrong');
}

function markPass() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking(); clearTimer();
  // Log the current player's pass (whether or not the cascade continues)
  logEntry(state.players[state.currentPlayerIdx], 'passed', 0);
  cascadeToNext('pass');
}

// Cascade the question to the next player in the ring (Long & Theme rounds, >1 player).
// Used by both Pass and Wrong. The player who finally answers correctly gets full points.
function cascadeToNext(reason) {
  const r = state.rounds[state.currentRoundIdx];
  const canCascade = (r.type === 'long' || r.type === 'theme') && state.players.length > 1;
  if (!canCascade) { reveal(reason); return; }

  // First handoff: remember who the question was originally asked to
  if (state.phase === 'question') {
    state.originalPlayerIdx = state.currentPlayerIdx;
  }
  // Move to next player in rotation
  state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
  // If we've cycled back to the original, every other player has had a go — reveal.
  // Nobody got it: control stays with the original asker, so the next question
  // starts one seat past them (tie-break rule a).
  if (state.currentPlayerIdx === state.originalPlayerIdx) {
    state.anchorIdx = state.originalPlayerIdx;
    reveal(reason);
    return;
  }
  state.phase = 'pass-attempt';
  state.matchAnnounced = false;
  renderQuestion(state.currentQuestion, { passing: true });
  speak(`${state.players[state.currentPlayerIdx].name}, over to you.`);
  startTimer();
  startListening();
}

async function reveal(outcome) {
  state.phase = 'reveal';
  renderHeader();
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';

  const head = outcome === 'right' ? '✓ Correct!'
             : outcome === 'wrong' ? '✗ Sorry — not quite.'
             : '— Passed.';
  main.appendChild(el('div', { class: 'player-up' }, head));
  main.appendChild(el('div', { class: 'answer-reveal' }, q.answer));
  if (q.explanation) main.appendChild(el('div', { class: 'explanation' }, q.explanation));

  main.appendChild(el('button', {
    class: 'big',
    onclick: () => { state.questionInRound++; nextQuestionInRound(); },
  }, 'Next →'));

  if (outcome !== 'right') await speak(`Answer: ${q.answer}.`);
}

function endRound() {
  stopListening(); stopSpeaking(); clearTimer();
  state.phase = 'round-end';
  state.currentRoundIdx++;
  if (state.currentRoundIdx >= state.rounds.length) return startLongTailOrEnd();

  renderHeader();
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, 'End of round'));

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const list = el('ol', { style: 'font-size: 1.2rem; max-width: 360px; margin: 1rem auto;' });
  sorted.forEach(p => list.appendChild(el('li', { style: 'margin: 0.4rem 0;' }, `${p.name} — ${p.score}`)));
  main.appendChild(list);

  main.appendChild(el('button', { class: 'big', onclick: startRound }, 'Next Round →'));
  speak('End of round.');
}

// ----- Pounce & Bounce -----
// Voice-free: the room is the buzzer, the host taps who pounced. A pounce ends the
// question. Right = +2×base; wrong = −base. base is 10 (long/theme) or the wager (bid).
function pounceBase() {
  const r = state.rounds[state.currentRoundIdx];
  return r.type === 'bid' ? (state.currentBid || 10) : 10;
}

function startPounce() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking(); clearTimer();
  state._prePounce = state.phase;
  state.phase = 'pounce-select';
  renderHeader();
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, '⚡ Who pounced?'));
  main.appendChild(el('div', { class: 'question-text' }, state.currentQuestion.question));
  const ctrls = el('div', { class: 'controls' });
  state.players.forEach((p, i) => ctrls.appendChild(
    el('button', { class: 'gold', onclick: () => pounceAnswer(i) }, p.name)
  ));
  ctrls.appendChild(el('button', { class: 'ghost', onclick: cancelPounce }, '← Back'));
  main.appendChild(ctrls);
  speak('Who pounced?');
}

function cancelPounce() {
  state.phase = state._prePounce || 'question';
  const r = state.rounds[state.currentRoundIdx];
  const opts = {};
  if (r.type === 'bid') opts.bid = state.currentBid;
  if (state.phase === 'pass-attempt') opts.passing = true;
  renderQuestion(state.currentQuestion, opts);
}

function pounceAnswer(idx) {
  state.pouncerIdx = idx;
  state.phase = 'pounce-answer';
  state.matchAnnounced = false;
  renderHeader();
  const base = pounceBase();
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' },
    `⚡ ${state.players[idx].name} pounced — +${base} if right, −${base * 2} if wrong`));
  main.appendChild(el('div', { class: 'question-text' }, state.currentQuestion.question));
  main.appendChild(el('input', {
    type: 'text', class: 'typed-answer', id: 'typed-answer',
    placeholder: 'Type the answer…', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => onTyped(e.target.value, e.target),
  }));
  const ctrls = el('div', { class: 'controls' });
  ctrls.appendChild(el('button', { class: 'right', onclick: () => settlePounce(true) }, '✓ Right'));
  ctrls.appendChild(el('button', { class: 'wrong', onclick: () => settlePounce(false) }, '✗ Wrong'));
  ctrls.appendChild(el('button', { class: 'ghost', onclick: startPounce }, '← Different pouncer'));
  main.appendChild(ctrls);
}

function settlePounce(correct) {
  const idx = state.pouncerIdx;
  const r = state.rounds[state.currentRoundIdx];
  const base = pounceBase();
  const p = state.players[idx];
  if (correct) {
    p.score += base;                                           // pounce right: +1× (modest reward)
    logEntry(p, 'right', base);
    if (r.type !== 'bid') state.anchorIdx = idx;               // control follows the pouncer
  } else {
    p.score -= base * 2;                                       // pounce wrong: −2× (steep, discourages loose pounces)
    logEntry(p, 'wrong', -base * 2);
    if (r.type !== 'bid' && state.originalPlayerIdx != null) state.anchorIdx = state.originalPlayerIdx;
  }
  reveal(correct ? 'right' : 'wrong');
}

// ----- Connect round (3 clues, buzz early for more) -----
function nextConnect() {
  for (const q of state.pool.connect) {
    if (state.used.has(q.id)) continue;
    if (state.avoidRepeats && state.partySeen.has(q.id)) continue;
    state.used.add(q.id); return q;
  }
  for (const q of state.pool.connect) {
    if (state.used.has(q.id)) continue;
    state.used.add(q.id); return q;
  }
  return null;
}

// Per-player, infinite-bounce Connect. The player in control (state.currentPlayerIdx)
// sees every clue revealed so far and either guesses (Got it / Wrong) or passes.
// Pass with clues left → reveal the next clue, same player stays. Pass on the last
// clue, or a wrong guess → bounce to the next player (they keep the revealed clues).
// A correct guess wins CONNECT_POINTS[revealed] (15/10/5) and control follows them.
async function askConnect() {
  const q = nextConnect();
  if (!q) {
    alert('No Connect questions in this set — pick a different question source, or add Connects.');
    return endRound();
  }
  // currentPlayerIdx & originalPlayerIdx were set by nextQuestionInRound (infinite bounce).
  state.currentQuestion = q;
  state.connectClueIdx = 0;
  state.matchAnnounced = false;
  state.phase = 'connect';
  renderConnect();
  await speak('Connect.');
  playPostcardCue();
  await speak(`${state.players[state.currentPlayerIdx].name}. ${q.clues[0]}`);
  startListening();
}

function renderConnect() {
  renderHeader();
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';
  const pts = CONNECT_POINTS[Math.min(state.connectClueIdx, CONNECT_POINTS.length - 1)];
  const player = state.players[state.currentPlayerIdx];
  const moreClues = state.connectClueIdx < q.clues.length - 1;
  main.appendChild(el('div', { class: 'player-up' }, `${player.name}  •  ⊰ Connect ⊱  •  worth ${pts}`));

  const clueBox = el('div', { class: 'connect-clues' });
  for (let i = 0; i <= state.connectClueIdx; i++) {
    clueBox.appendChild(el('div', { class: 'connect-clue' }, `${i + 1}. ${q.clues[i]}`));
  }
  main.appendChild(clueBox);

  main.appendChild(el('input', {
    type: 'text', class: 'typed-answer', id: 'typed-answer',
    placeholder: 'Or type the connection…', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => onTyped(e.target.value, e.target),
  }));

  const ctrls = el('div', { class: 'controls' });
  ctrls.appendChild(el('button', { class: 'right', onclick: () => connectGuess(true) }, '✓ Got it'));
  ctrls.appendChild(el('button', { class: 'wrong', onclick: () => connectGuess(false) }, '✗ Wrong'));
  ctrls.appendChild(el('button', { class: 'ghost', onclick: connectPass },
    moreClues ? 'Pass → next clue' : 'Pass → next player'));
  ctrls.appendChild(el('button', { class: 'ghost', onclick: () => speak(q.clues[state.connectClueIdx]) }, '🔁 Repeat clue'));
  main.appendChild(ctrls);
}

function connectGuess(correct) {
  if (state.phase !== 'connect') return;
  stopListening(); stopSpeaking(); clearTimer();
  if (correct) {
    const pts = CONNECT_POINTS[Math.min(state.connectClueIdx, CONNECT_POINTS.length - 1)];
    const p = state.players[state.currentPlayerIdx];
    p.score += pts;
    logEntry(p, 'right', pts);
    state.anchorIdx = state.currentPlayerIdx;   // control follows the winner (next connect)
    connectReveal(state.currentPlayerIdx, pts);
  } else {
    logEntry(state.players[state.currentPlayerIdx], 'wrong', 0);  // wrong guess: 0, forfeit
    connectBounce();
  }
}

async function connectPass() {
  if (state.phase !== 'connect') return;
  stopListening(); stopSpeaking(); clearTimer();
  const q = state.currentQuestion;
  logEntry(state.players[state.currentPlayerIdx], 'passed', 0);
  if (state.connectClueIdx < q.clues.length - 1) {
    // Reveal the next clue; same player keeps control.
    state.connectClueIdx++;
    state.matchAnnounced = false;
    renderConnect();
    await speak(q.clues[state.connectClueIdx]);
    startListening();
  } else {
    // No clues left — hand off to the next player.
    connectBounce();
  }
}

// Bounce the (still-unsolved) connect to the next player, keeping the clues revealed.
// If it comes back round to the player it started with, nobody got it.
function connectBounce() {
  const n = state.players.length;
  if (n <= 1) { state.anchorIdx = state.originalPlayerIdx; return connectReveal(-1, 0); }
  state.currentPlayerIdx = (state.currentPlayerIdx + 1) % n;
  if (state.currentPlayerIdx === state.originalPlayerIdx) {
    state.anchorIdx = state.originalPlayerIdx;   // full loop, nobody got it (tie-break a)
    return connectReveal(-1, 0);
  }
  state.matchAnnounced = false;
  renderConnect();
  speak(`${state.players[state.currentPlayerIdx].name}, over to you.`);
  startListening();
}

async function connectReveal(playerIdx, pts) {
  stopListening(); stopSpeaking(); clearTimer();
  state.phase = 'reveal';
  renderHeader();
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' },
    playerIdx >= 0 ? `✓ ${state.players[playerIdx].name} — +${pts}!` : '— Nobody got it.'));
  main.appendChild(el('div', { class: 'answer-reveal' }, q.answer));
  if (q.explanation) main.appendChild(el('div', { class: 'explanation' }, q.explanation));
  main.appendChild(el('button', {
    class: 'big',
    onclick: () => { state.questionInRound++; nextQuestionInRound(); },
  }, 'Next →'));
  await speak(`The connection: ${q.answer}.`);
}

// ----- Long Tail (end-of-game callback round) -----
async function startLongTailOrEnd() {
  // Iranian Mode skips Long Tail — callbacks are India-anchored connections.
  if (state.iranianMode) return endGame();
  const callbacks = state.questions.filter(q => q.callback && !state.used.has(q.id));
  if (!callbacks.length) return endGame();

  const q = callbacks[Math.floor(Math.random() * callbacks.length)];
  state.used.add(q.id);
  state.currentQuestion = q;
  state.phase = 'long-tail-intro';

  // Header reflects "the long tail"
  const ri = $('#round-info');
  if (ri) ri.textContent = '⊰ THE LONG TAIL · ONE LAST QUESTION ⊱';

  const sb = $('#scoreboard');
  if (sb) {
    sb.innerHTML = '';
    state.players.forEach(p => sb.appendChild(el('div', { class: 'score-chip' }, `${p.name}: ${p.score}`)));
  }

  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, '⊰ The Long Tail ⊱'));
  main.appendChild(el('div', { class: 'question-text' },
    'A bonus connection question to close the night. First player to answer wins +5. Wrong answers cost nothing.'));
  main.appendChild(el('button', { class: 'big', onclick: askLongTail }, 'Ask the question →'));

  playPostcardCue();
  await speak('One last thing — a bonus connection. First in wins five.');
}

async function askLongTail() {
  state.phase = 'long-tail-question';
  state.matchAnnounced = false;
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, '⊰ The Long Tail ⊱'));
  main.appendChild(el('div', { class: 'question-text' }, q.question));

  // Typed-answer input — same as in regular questions
  main.appendChild(el('input', {
    type: 'text',
    class: 'typed-answer',
    id: 'typed-answer',
    placeholder: 'Or type your answer here…',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (e) => onTyped(e.target.value, e.target),
  }));

  if (state.autoJudge) {
    main.appendChild(el('div', { id: 'heard-text', class: 'heard-text' }, [
      el('span', { class: 'mic-indicator live' }),
      el('span', { class: 'heard-label' }, 'Listening…'),
    ]));
  }

  const ctrls = el('div', { class: 'controls' });
  state.players.forEach((p, i) => {
    ctrls.appendChild(el('button', {
      class: 'gold',
      style: 'font-size: 1rem;',
      onclick: () => settleLongTail(i, true),
    }, `${p.name} got it`));
  });
  ctrls.appendChild(el('button', {
    class: 'ghost',
    onclick: () => settleLongTail(-1, false),
  }, 'Nobody got it'));
  main.appendChild(ctrls);

  playPostcardCue();
  await speak(q.question);
  startListening();
}

async function settleLongTail(playerIdx, correct) {
  stopListening(); stopSpeaking();
  if (correct && playerIdx >= 0) {
    state.players[playerIdx].score += 5;
    logEntry(state.players[playerIdx], 'right', 5);
  }

  state.phase = 'reveal';
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';

  const head = correct
    ? `✓ ${state.players[playerIdx].name} — +5!`
    : '— Nobody got it.';
  main.appendChild(el('div', { class: 'player-up' }, head));
  main.appendChild(el('div', { class: 'answer-reveal' }, q.answer));
  if (q.explanation) main.appendChild(el('div', { class: 'explanation' }, q.explanation));
  main.appendChild(el('button', { class: 'big', onclick: endGame }, 'See Final Scores →'));

  await speak(`The connection: ${q.answer}.`);
}

function endGame() {
  // Persist this session's questions into each named player's individual seen-set
  persistSessionToPlayers();

  showScreen('end');
  renderWinnerView();

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  // Small additional delay on top of speak()'s built-in 80ms — the winner line
  // is the last impression of the game and must land. settleLongTail's
  // "connection" speech may still be in-flight when the user clicked through.
  if (sorted.length) {
    setTimeout(() => {
      speak(`That's a wrap. Winner: ${sorted[0].name}, with ${sorted[0].score} points. Well played, everyone.`);
    }, 250);
  }
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function renderAnswerList(container, entries, outcome) {
  if (!container) return;
  container.innerHTML = '';
  if (!entries.length) {
    container.appendChild(el('li', { class: 'empty' }, 'Nothing here.'));
    return;
  }
  entries.forEach(e => {
    const li = el('li', { class: 'entry ' + outcome });
    const badgeText = (e.points > 0 ? '+' : '') + e.points;
    li.appendChild(el('span', { class: 'badge' }, badgeText));
    li.appendChild(el('div', { class: 'qa' }, [
      el('div', { class: 'q' }, truncate(e.qtext, 160)),
      el('div', { class: 'a' }, '→ ' + e.answer),
    ]));
    container.appendChild(li);
  });
}

function renderWinnerView() {
  $('#winner-view').style.display = '';
  $('#all-players-view').style.display = 'none';

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  if (!sorted.length) return;
  const winner = sorted[0];

  $('#winner-name').textContent = winner.name || 'You';
  $('#winner-score').textContent = `${winner.score} point${winner.score === 1 ? '' : 's'}`;

  const correct = (winner.log || []).filter(e => e.outcome === 'right');
  const wrong   = (winner.log || []).filter(e => e.outcome === 'wrong');
  const passed  = (winner.log || []).filter(e => e.outcome === 'passed');

  // Top moments: correct answers sorted by points descending
  const topMoments = [...correct].sort((a, b) => b.points - a.points);
  renderAnswerList($('#winner-correct'), topMoments, 'right');
  renderAnswerList($('#winner-wrong'), wrong, 'wrong');
  renderAnswerList($('#winner-passed'), passed, 'passed');

  $('#count-correct').textContent = correct.length;
  $('#count-wrong').textContent = wrong.length;
  $('#count-passed').textContent = passed.length;
}

function renderAllPlayersView() {
  $('#winner-view').style.display = 'none';
  $('#all-players-view').style.display = '';

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const container = $('#player-recaps');
  container.innerHTML = '';

  sorted.forEach((p, idx) => {
    const correct = (p.log || []).filter(e => e.outcome === 'right');
    const wrong   = (p.log || []).filter(e => e.outcome === 'wrong');
    const passed  = (p.log || []).filter(e => e.outcome === 'passed');

    const card = el('div', { class: 'player-recap-card' + (idx === 0 ? ' winner' : '') });

    card.appendChild(el('div', { class: 'player-recap-header' }, [
      el('div', { class: 'rank' }, '#' + (idx + 1)),
      el('div', { class: 'name-and-score' }, [
        el('div', { class: 'p-name' }, p.name || `Player ${idx + 1}`),
        el('div', { class: 'p-score' }, p.score + ' pts'),
      ]),
    ]));

    card.appendChild(el('div', { class: 'player-stats' }, [
      el('span', {}, `✓ ${correct.length}`),
      el('span', {}, `✗ ${wrong.length}`),
      el('span', {}, `↳ ${passed.length}`),
    ]));

    const compactList = (entries, outcome) => {
      const ul = el('ul', { class: 'answers-list compact' });
      entries.forEach(e => {
        const li = el('li', { class: outcome });
        if (outcome === 'right') {
          li.appendChild(el('span', { class: 'badge' }, '+' + e.points));
        }
        li.appendChild(el('div', { class: 'qa' }, [
          el('div', { class: 'q' }, truncate(e.qtext, 120)),
          el('div', { class: 'a' }, '→ ' + e.answer),
        ]));
        ul.appendChild(li);
      });
      return ul;
    };

    if (correct.length) {
      const det = el('details', {});
      det.appendChild(el('summary', {}, `Got right (${correct.length})`));
      det.appendChild(compactList(correct, 'right'));
      card.appendChild(det);
    }
    if (wrong.length) {
      const det = el('details', {});
      det.appendChild(el('summary', {}, `Got wrong (${wrong.length})`));
      det.appendChild(compactList(wrong, 'wrong'));
      card.appendChild(det);
    }
    if (passed.length) {
      const det = el('details', {});
      det.appendChild(el('summary', {}, `Passed (${passed.length})`));
      det.appendChild(compactList(passed, 'passed'));
      card.appendChild(det);
    }

    container.appendChild(card);
  });
}

// ----- Init -----
async function loadQuestions() {
  // Primary path: questions.js sets window.QUESTIONS_DATA — works for double-click (file://) AND for hosted (https).
  if (window.QUESTIONS_DATA && Array.isArray(window.QUESTIONS_DATA.questions)) {
    state.questions = window.QUESTIONS_DATA.questions;
  } else {
    // Fallback: try fetch (only works when served, not file://)
    try {
      const res = await fetch('questions.json');
      const data = await res.json();
      state.questions = data.questions || [];
    } catch (e) {
      console.error('Failed to load questions', e);
      state.questions = [];
    }
  }
  const cnt = $('#question-count');
  if (cnt) cnt.textContent = `${state.questions.length} questions in the bank.`;
  renderSourceOptions();
}

// Enable/disable the "All new" / "Mainly new" options based on how many new
// (today/yesterday) questions exist, and pick a sensible default.
function renderSourceOptions() {
  const nNew = countNewRegular();
  const label = document.querySelector('.src-count[data-src="new"]');
  if (label) label.textContent = nNew ? `(${nNew} available)` : '(none)';

  const radios = {
    new: document.querySelector('input[name="qsource"][value="new"]'),
    mainly: document.querySelector('input[name="qsource"][value="mainly"]'),
    full: document.querySelector('input[name="qsource"][value="full"]'),
  };
  if (!radios.new) return;

  const allowAll = nNew >= NEW_MIN_ALL;
  const allowMainly = nNew >= NEW_MIN_MAINLY;
  radios.new.disabled = !allowAll;
  radios.mainly.disabled = !allowMainly;
  radios.new.closest('.source-opt').classList.toggle('disabled', !allowAll);
  radios.mainly.closest('.source-opt').classList.toggle('disabled', !allowMainly);

  // Default: All new if there's a fresh set, else Full database.
  const def = allowAll ? 'new' : 'full';
  Object.values(radios).forEach(r => { r.checked = (r.value === def); });
  state.questionSource = def;

  const hint = $('#source-hint');
  if (hint) {
    hint.textContent = allowAll
      ? `${nNew} fresh questions ready — playing All new by default.`
      : allowMainly
        ? `Only ${nNew} new questions — "All new" is off; "Mainly new" and "Full database" are available.`
        : `No fresh set (need ${NEW_MIN_MAINLY}+ made today or yesterday). Ask Claude to make a new batch to unlock All / Mainly new.`;
  }
}

function init() {
  // One-time migration from old whole-party history keys to per-player keys
  try { migrateLegacyHistoryKeys(); } catch (e) { console.warn('history migration failed:', e); }

  state.players = [
    { id: 1, name: '', score: 0, log: [] },
    { id: 2, name: '', score: 0, log: [] },
  ];
  state.rounds = [
    { type: 'long',    count: 2 },
    { type: 'theme',   count: 4, theme: 'cinema' },
    { type: 'bid',     count: 1 },
    { type: 'theme',   count: 4, theme: 'business' },
    { type: 'long',    count: 2 },
    { type: 'connect', count: 3 },
    { type: 'theme',   count: 4, theme: 'current_affairs' },
    { type: 'bid',     count: 1 },
  ];

  $('#add-player-btn').addEventListener('click', addPlayer);
  $$('.add-round-btn').forEach(btn => {
    btn.addEventListener('click', () => addRound(btn.dataset.type));
  });
  $('#start-game-btn').addEventListener('click', startGame);
  $('#back-to-setup-btn').addEventListener('click', () => {
    stopListening(); stopSpeaking();
    showScreen('setup');
  });
  const restartToSetup = () => {
    state.players.forEach(p => { p.score = 0; p.log = []; });
    state.used.clear();
    showScreen('setup');
  };
  $('#play-again-btn').addEventListener('click', restartToSetup);
  const playAgain2 = $('#play-again-btn-2');
  if (playAgain2) playAgain2.addEventListener('click', restartToSetup);
  const seeAll = $('#see-all-players');
  if (seeAll) seeAll.addEventListener('click', renderAllPlayersView);
  const backWinner = $('#back-to-winner');
  if (backWinner) backWinner.addEventListener('click', renderWinnerView);
  $('#voice-host').addEventListener('change', e => state.voiceHost = e.target.checked);
  $('#auto-judge').addEventListener('change', e => state.autoJudge = e.target.checked);
  $('#timer-enabled').addEventListener('change', e => state.timerEnabled = e.target.checked);
  $('#avoid-repeats').addEventListener('change', e => state.avoidRepeats = e.target.checked);
  $$('input[name="qsource"]').forEach(r => r.addEventListener('change', e => {
    if (e.target.checked) state.questionSource = e.target.value;
  }));
  $('#iranian-mode').addEventListener('change', e => {
    state.iranianMode = e.target.checked;
    // Re-render rounds so the theme dropdown swaps to the right option set,
    // and snap any India-only theme back to a valid one.
    renderRounds();
    const hint = $('#iranian-mode-hint');
    if (hint) hint.style.display = state.iranianMode ? 'block' : 'none';
  });

  $('#voice-select').addEventListener('change', e => {
    const v = getAllVoices().find(x => x.voiceURI === e.target.value);
    if (v) {
      preferredVoice = v;
      localStorage.setItem('quizVoiceURI', v.voiceURI);
      renderVoiceInfo(getAllVoices());
    }
  });
  $('#voice-test-btn').addEventListener('click', () => {
    speak('Namaste. This is a sample of the chosen voice.');
  });

  // Voice speed — restore saved choice, then wire change listener
  const savedRate = parseFloat(localStorage.getItem('quizVoiceRate') || '');
  if (savedRate >= 0.5 && savedRate <= 2) {
    state.voiceRate = savedRate;
    const sel = $('#voice-rate');
    if (sel) sel.value = String(savedRate);
  }
  $('#voice-rate').addEventListener('change', e => {
    const r = parseFloat(e.target.value);
    if (r >= 0.5 && r <= 2) {
      state.voiceRate = r;
      localStorage.setItem('quizVoiceRate', String(r));
    }
  });

  renderPlayers();
  renderRounds();
  loadQuestions();
}

document.addEventListener('DOMContentLoaded', init);
