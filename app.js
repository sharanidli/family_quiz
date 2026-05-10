// =============================================================
// Not Such A Tough Quiz Also
// Family-friendly India quiz with voice host + listen-and-judge
// =============================================================

const THEME_OPTIONS = [
  { id: 'cricket',   label: 'Cricket' },
  { id: 'cinema',    label: 'Cinema & Bollywood' },
  { id: 'history',   label: 'History & Freedom' },
  { id: 'geography', label: 'Geography' },
  { id: 'business',  label: 'Business & Brands' },
  { id: 'polity',    label: 'Polity & Constitution' },
];

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
  questions: [],
  pool: { byTopic: {}, all: [] },
  used: new Set(),
  phase: 'setup',
  currentQuestion: null,
  currentBid: 0,
  voiceHost: true,
  autoJudge: true,
  listening: false,
  recognition: null,
  heard: '',
  matchAnnounced: false,
};

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
        oninput: (e) => { p.name = e.target.value; },
      }),
      el('button', {
        class: 'remove',
        title: 'Remove',
        onclick: () => { state.players.splice(i, 1); renderPlayers(); }
      }, '×'),
    ]);
    list.appendChild(row);
  });
}

function addPlayer() {
  state.players.push({ id: Date.now() + Math.random(), name: '', score: 0 });
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
      const sel = el('select', {
        onchange: (e) => { r.theme = e.target.value; },
      });
      THEME_OPTIONS.forEach(opt => {
        const o = el('option', { value: opt.id }, opt.label);
        if (opt.id === r.theme) o.selected = true;
        sel.appendChild(o);
      });
      cells.push(sel);
    } else {
      cells.push(el('span'));
    }

    const countLabel = (r.type === 'theme') ? 'questions' : 'per player';
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

    list.appendChild(el('div', { class: 'round-row' }, cells));
  });
}

function roundLabel(r) {
  if (r.type === 'long')  return 'Long Question';
  if (r.type === 'theme') return 'Theme Round';
  if (r.type === 'bid')   return 'Bid Round';
  return r.type;
}

function addRound(type) {
  const defaults = {
    long:  { type: 'long',  count: 2 },
    theme: { type: 'theme', count: 6, theme: 'cricket' },
    bid:   { type: 'bid',   count: 1 },
  };
  state.rounds.push({ ...defaults[type] });
  renderRounds();
}

// ----- Question pool -----
function buildPool() {
  state.pool.byTopic = {};
  state.questions.forEach(q => {
    const t = q.topic;
    if (!state.pool.byTopic[t]) state.pool.byTopic[t] = [];
    state.pool.byTopic[t].push(q);
  });
  Object.values(state.pool.byTopic).forEach(arr => shuffle(arr));
  state.pool.all = shuffle([...state.questions]);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextQuestion(opts = {}) {
  const { topic, bidEligible } = opts;
  const pool = topic ? (state.pool.byTopic[topic] || []) : state.pool.all;

  for (const q of pool) {
    if (state.used.has(q.id)) continue;
    if (bidEligible && !q.bid_eligible) continue;
    state.used.add(q.id);
    return q;
  }
  // Relax bid filter
  if (bidEligible) {
    for (const q of pool) {
      if (state.used.has(q.id)) continue;
      state.used.add(q.id);
      return q;
    }
  }
  // Final fallback: any unused, any topic
  for (const q of state.questions) {
    if (!state.used.has(q.id)) { state.used.add(q.id); return q; }
  }
  return null;
}

// ----- Voice (TTS) -----
let preferredVoice = null;

function getAllVoices() {
  return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

function pickDefaultVoice(voices) {
  return voices.find(v => v.lang === 'en-IN')
      || voices.find(v => /india|heera|ravi|isha|prabhat/i.test(v.name))
      || voices.find(v => /^Google.*english/i.test(v.name) && v.lang === 'en-IN')
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang && v.lang.startsWith('en'))
      || voices[0]
      || null;
}

function loadVoices() {
  const voices = getAllVoices();
  if (!voices.length) return;
  const saved = localStorage.getItem('quizVoiceURI');
  preferredVoice = (saved && voices.find(v => v.voiceURI === saved)) || pickDefaultVoice(voices);
  populateVoicePicker(voices);
}

function populateVoicePicker(voices) {
  const select = $('#voice-select');
  if (!select) return;
  const englishVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const otherVoices  = voices.filter(v => !v.lang || !v.lang.toLowerCase().startsWith('en'));
  select.innerHTML = '';
  const addOpt = (v) => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    if (preferredVoice && v.voiceURI === preferredVoice.voiceURI) opt.selected = true;
    select.appendChild(opt);
  };
  englishVoices.forEach(addOpt);
  if (otherVoices.length) {
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '— other languages —';
    select.appendChild(sep);
    otherVoices.forEach(addOpt);
  }
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
      const u = new SpeechSynthesisUtterance(text);
      if (preferredVoice) u.voice = preferredVoice;
      u.rate = opts.rate || 0.95;
      u.pitch = opts.pitch || 1;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
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

  state.players.forEach(p => p.score = 0);
  state.currentRoundIdx = 0;
  state.questionInRound = 0;
  state.currentPlayerIdx = 0;
  state.used.clear();
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
  state.phase = 'round-intro';
  renderHeader();

  let intro;
  if (r.type === 'long') {
    intro = `Long Question round. ${r.count} question${r.count > 1 ? 's' : ''} per player.`;
  } else if (r.type === 'theme') {
    const t = THEME_OPTIONS.find(t => t.id === r.theme);
    intro = `Theme round: ${t ? t.label : r.theme}. ${r.count} questions, taken in turn.`;
  } else {
    intro = `Bid round. ${r.count} per player. Wager 5, 10, or 20 — right answer wins your wager, wrong loses it.`;
  }

  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, intro));
  main.appendChild(el('button', { class: 'big', onclick: nextQuestionInRound }, 'Begin Round →'));
  speak(intro);
}

async function nextQuestionInRound() {
  const r = state.rounds[state.currentRoundIdx];
  const playerCount = state.players.length;
  const total = (r.type === 'theme') ? r.count : r.count * playerCount;

  if (state.questionInRound >= total) return endRound();

  state.currentPlayerIdx = state.questionInRound % playerCount;

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
        await speak(`${player.name}, you've wagered ${v}. Here is your question.`);
        await speak(q.question);
        startListening();
      }
    }, '+' + v));
  });
  main.appendChild(row);
  speak(`${player.name}, what's your wager? Five, ten, or twenty.`);
}

function renderHeader() {
  const r = state.rounds[state.currentRoundIdx];
  const ri = $('#round-info');
  if (r) {
    let label = `Round ${state.currentRoundIdx + 1} of ${state.rounds.length} • ${roundLabel(r)}`;
    if (r.type === 'theme') {
      const t = THEME_OPTIONS.find(t => t.id === r.theme);
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

  const headerBits = [player.name];
  if (opts.bid) headerBits.push(`Wager: ${opts.bid}`);
  if (opts.passing) headerBits.push('Pass attempt — 5 pts');
  main.appendChild(el('div', { class: 'player-up' }, headerBits.join(' • ')));

  main.appendChild(el('div', { class: 'question-text' }, q.question));

  if (state.autoJudge) {
    main.appendChild(el('div', { id: 'heard-text', class: 'heard-text' }, [
      el('span', { class: 'mic-indicator live' }),
      el('span', { class: 'heard-label' }, 'Listening...'),
    ]));
  }

  const ctrls = [
    el('button', { class: 'right', onclick: markRight }, '✓ Right'),
    el('button', { class: 'wrong', onclick: markWrong }, '✗ Wrong'),
  ];
  if (!opts.passing && state.rounds[state.currentRoundIdx].type === 'long' && state.players.length > 1) {
    ctrls.push(el('button', { class: 'ghost', onclick: markPass }, 'Pass'));
  }
  ctrls.push(el('button', { class: 'ghost', onclick: () => speak(q.question) }, '🔁 Repeat'));
  main.appendChild(el('div', { class: 'controls' }, ctrls));
}

function markRight() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking();
  const r = state.rounds[state.currentRoundIdx];
  const player = state.players[state.currentPlayerIdx];
  if (r.type === 'bid') player.score += state.currentBid;
  else if (state.phase === 'pass-attempt') player.score += 5;
  else player.score += 10;
  reveal('right');
}

function markWrong() {
  if (state.phase !== 'question' && state.phase !== 'pass-attempt') return;
  stopListening(); stopSpeaking();
  const r = state.rounds[state.currentRoundIdx];
  const player = state.players[state.currentPlayerIdx];
  if (r.type === 'bid') player.score -= state.currentBid;
  reveal('wrong');
}

function markPass() {
  if (state.phase !== 'question') return;
  stopListening(); stopSpeaking();
  const r = state.rounds[state.currentRoundIdx];
  if (r.type === 'long' && state.players.length > 1) {
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    state.phase = 'pass-attempt';
    renderQuestion(state.currentQuestion, { passing: true });
    speak(`Pass! ${state.players[state.currentPlayerIdx].name}, would you like to try? Five points if you get it.`);
    startListening();
  } else {
    reveal('pass');
  }
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

  if (outcome !== 'right') await speak(`The answer is: ${q.answer}.`);
}

function endRound() {
  stopListening(); stopSpeaking();
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

// ----- Long Tail (end-of-game callback round) -----
async function startLongTailOrEnd() {
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
    'A bonus connection question to close the night. First player to answer wins +25. Wrong answers cost nothing.'));
  main.appendChild(el('button', { class: 'big', onclick: askLongTail }, 'Ask the question →'));

  playPostcardCue();
  await speak('And one last thing for tonight. A bonus connection question to close us out. First player to answer wins twenty-five.');
}

async function askLongTail() {
  state.phase = 'long-tail-question';
  state.matchAnnounced = false;
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'player-up' }, '⊰ The Long Tail ⊱'));
  main.appendChild(el('div', { class: 'question-text' }, q.question));

  if (state.autoJudge) {
    main.appendChild(el('div', { id: 'heard-text', class: 'heard-text' }, [
      el('span', { class: 'mic-indicator live' }),
      el('span', { class: 'heard-label' }, 'Listening...'),
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
  if (correct && playerIdx >= 0) state.players[playerIdx].score += 25;

  state.phase = 'reveal';
  const q = state.currentQuestion;
  const main = $('#game-main');
  main.innerHTML = '';

  const head = correct
    ? `✓ ${state.players[playerIdx].name} — +25!`
    : '— Nobody got it.';
  main.appendChild(el('div', { class: 'player-up' }, head));
  main.appendChild(el('div', { class: 'answer-reveal' }, q.answer));
  if (q.explanation) main.appendChild(el('div', { class: 'explanation' }, q.explanation));
  main.appendChild(el('button', { class: 'big', onclick: endGame }, 'See Final Scores →'));

  await speak(`The connection: ${q.answer}.`);
}

function endGame() {
  showScreen('end');
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const ol = $('#final-scoreboard');
  ol.innerHTML = '';
  sorted.forEach(p => ol.appendChild(el('li', {}, `${p.name} — ${p.score}`)));
  if (sorted.length) speak(`That's a wrap. Winner: ${sorted[0].name}, with ${sorted[0].score} points. Well played, everyone.`);
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
}

function init() {
  state.players = [
    { id: 1, name: '', score: 0 },
    { id: 2, name: '', score: 0 },
  ];
  state.rounds = [
    { type: 'long',  count: 2 },
    { type: 'theme', count: 6, theme: 'cricket' },
    { type: 'bid',   count: 1 },
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
  $('#play-again-btn').addEventListener('click', () => {
    state.players.forEach(p => p.score = 0);
    state.used.clear();
    showScreen('setup');
  });
  $('#voice-host').addEventListener('change', e => state.voiceHost = e.target.checked);
  $('#auto-judge').addEventListener('change', e => state.autoJudge = e.target.checked);

  $('#voice-select').addEventListener('change', e => {
    const v = getAllVoices().find(x => x.voiceURI === e.target.value);
    if (v) {
      preferredVoice = v;
      localStorage.setItem('quizVoiceURI', v.voiceURI);
    }
  });
  $('#voice-test-btn').addEventListener('click', () => {
    speak('Namaste. This is a sample of the chosen voice.');
  });

  renderPlayers();
  renderRounds();
  loadQuestions();
}

document.addEventListener('DOMContentLoaded', init);
