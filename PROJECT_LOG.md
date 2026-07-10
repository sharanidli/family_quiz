# Project Log: Not Such A Tough Quiz Also

## Context

Family India-quiz game inspired by playing voice-mode ChatGPT with in-laws.
Goal: a static HTML page (no backend, hostable on GitHub Pages) that:
- Reads questions aloud (voice host)
- Listens for spoken answers and fuzzy-matches them (with manual override)
- Supports three round types: Long Question, Theme Round, Bid
- Plays on a single device (laptop or phone, passed around)

## Decisions (2026-05-09)

- **Title**: "Not Such A Tough Quiz Also" (Sharan's choice)
- **Question source**: Original questions in Joy Bhattacharjya's voice — *not* reused ToI questions (copyright + Googleable mid-game)
- **Bank size**: 150 seed questions (Sharan agreed)
- **Hosting**: GitHub Pages on Sharan's own GitHub
- **Self-score vs auto-judge**: Hybrid — listen + fuzzy-match, with always-available Right/Wrong/Pass override. Chrome/Edge `webkitSpeechRecognition` with `lang='en-IN'` for Indian English
- **Round mechanics**:
  - Long Question: +10 right, +5 if next player picks up a pass, 0 wrong
  - Theme Round: +10 right, in turn order, fixed count
  - Bid Round: wager 5/10/20 before seeing the question; +/- wager
- **No drag-to-reorder for rounds in v1** — remove and re-add to reorder

## Files

| File | Purpose |
|---|---|
| `index.html` | Three screens: setup, game, end |
| `style.css` | Dark theme, large readable fonts, mobile-friendly |
| `app.js` | Game state, TTS via `speechSynthesis`, STT via `webkitSpeechRecognition`, Levenshtein-based fuzzy matcher |
| `questions.json` | 150 questions: 25 cricket, 25 cinema, 25 history, 15 geography, 15 business, 10 polity, 10 mythology, 10 music, 10 books, 5 general; 47 flagged `bid_eligible` |
| `README.md` | How to play + how to push to GitHub Pages + how to add questions |

## Status (2026-05-09)

- v1 played at home. Voice host works; listening is mediocre on Indian English (no fix without paid backend).
- **Question bank: 488** (181 hard, 69 bid-eligible, **12 callback** for Long Tail).
- **Joy's Postcard** (2026-05-10): rotating openers (12) plus a soft 3-note arpeggio cue (`playPostcardCue` — Web Audio, no asset) play before each Long & Theme question, after the player's name. Bid skipped to keep its own wager-theatre.
- **Long Tail** (2026-05-10): after the last round ends, `startLongTailOrEnd()` picks an unused `callback: true` question and runs it as a bonus connection round. First-to-answer scoring (host clicks `[Player] got it` / `Nobody got it`); +25 right, 0 wrong. Then end screen.
- **Design pass 1** (2026-05-10): repalette — `--accent` rose-red → deep teal `#0d8c8c`; `--wrong` → maroon `#9b2226`; `button.big` is now gold-on-dark with letter-spaced uppercase. **Yatra One** (Google Fonts) display face for `h1`, `.player-up`, `.answer-reveal` only; Georgia retained for body copy. `--muted` lifted from `#a0a0a0` to `#b8b8b8` for elder readability.
- **Dropdown fix** (2026-05-10): added explicit `select option { background: var(--card); }` — native dropdown panels now visible in dark mode (were white-on-white at rest).
- **Timer + typed answer + party history + 2 new themes** (2026-05-10):
  - Optional 2-minute timer (Settings checkbox, off by default). Timer chip in player-up area; warns at 30s, danger at 10s, "Time!" indicator at 0; host still has the final say.
  - **Typed-answer input** is now visible during every question — alongside the listening box. Same fuzzy match runs on the typed text; matched typing turns the input green and pulses the Right button. Added because browser STT is unreliable for Indian English.
  - **Party history**: localStorage tracks question IDs seen by a "party" (sorted player names joined). Setup screen shows hint ("This party has seen X questions across previous games") with a Reset link. Setting "Avoid questions this party has already seen" defaults ON. **Caveat:** localStorage is per-device-per-browser; cross-device sync needs Firebase (not built).
  - **Two new themes** added: `south_india` (59 questions tagged) and `languages` (27 questions tagged). Question schema now supports `themes: []` array; `nextQuestion()` resolves a theme key by checking both `topic` AND `themes` membership. Existing 6 themes (Cricket, Cinema, History, Geography, Business, Polity) work unchanged.
- Voice picker added in Settings; choice persists in localStorage. Mic permission re-prompts on `file://` (will be remembered on HTTPS once on Pages).
- Auto-reveal-on-match removed — green highlight + chime + pulsing Right button now, but the host always confirms.
- **Not yet pushed to GitHub Pages** — Sharan to do this when ready.

## Status (2026-05-10, evening)

Live at https://sharanidli.github.io/family_quiz/ at commit `ff8519c`. All four "v3" features shipped: 2-min timer, typed-answer input alongside listening, party history (localStorage), and South India + Languages themes.

**Question bank now at 1,234** (was 979 after first fact-check; 400 attempted today, ~145 dropped after second fact-check, ~65 patched, net 255 actually-new). 480 hard (~39%), 102 bid-eligible, 12 callbacks. Coverage: Cricket 147, Cinema 139, History 184, Geography 143, Business 117, Polity 93, Mythology 92, Music 89, Books 111, General 119. Theme tags: South India ~155, Languages ~75. Schema now includes `created` (date) on every question.

### End-game recap + per-player question history (2026-05-13)

**Live at commit `8ef9e48`. Bank unchanged at 1,632 questions.**

Two new features shipped:

1. **End-of-game recap screen.** Replaced the old `<ol>` of final scores with a richer two-view layout.
   - Default view: gold "🏆 Congrats <name>!" winner card with final score; "Your top moments" (correct answers sorted by points descending); collapsible "You got these wrong (N)" and "You passed on (N)" sections; "See how everyone else did →" link; Play Again.
   - All-players view (toggle): one card per player ranked by score, winner highlighted with gold tint, quick stats line (`✓ N  ✗ N  ↳ N`), and per-player collapsible right/wrong/passed lists. "← Back to winner" returns.
   - To support the recap, each player now carries a `log: []` of per-question entries `{qid, qtext, answer, outcome, points, roundType}`. Logging happens in `markRight` / `markWrong` / `markPass` / `settleLongTail`. Pass cascade through the player ring correctly logs each pass per player.
   - Files: `index.html` (new end-screen markup), `style.css` (recap styles — winner card, answer lists with badges, all-players cards), `app.js` (log tracking + `renderWinnerView` + `renderAllPlayersView`).

2. **Per-player question history (replaces party-keyed history).** Previously, "seen" questions were stored under a single key derived from the whole party's joined names (`quiz_seen_alice|bob|carol|dave`). This meant that if any one player joined a different group, their previously-seen questions could recycle. Fix:
   - One localStorage key per player: `quiz_player_seen_<name>`.
   - On game start, `loadAllPlayersSeen()` unions the seen-sets of all current players — that's the exclusion set used when picking questions.
   - On game end, `persistSessionToPlayers()` adds the session's used questions to *each* named player's seen-set.
   - Setup screen now shows one chip per named player with a per-person "[reset]" link, plus a chip-style "new" badge for unrecognised names.
   - Migration: on `init()`, `migrateLegacyHistoryKeys()` scans for any old `quiz_seen_<joined-names>` keys, distributes their question IDs into each named player's new individual key, then removes the old key. Idempotent.
   - **Known limitation**: two different people with the same name on the same device collide (e.g., two different Sharans share one history bucket). For a family playing on a shared laptop the practical collision risk is low; the per-player reset link is the escape hatch. True cross-device per-person history needs a backend (Firebase) — not built.

### Failed third-round generation attempt (2026-05-13)

Attempted to add another 300 questions (10 specialist writers × 30 each, Wave 1) followed by peer review (Wave 2: 10 reviewers cross-checking each others' output, circular mapping). All 10 writers completed and wrote 300 questions to `/tmp/new_questions_<topic>.json`. First reviewer wave hit rate limit immediately (was right after Wave 1 — no headroom). Re-launched reviewers later, but by then **WSL had rebooted overnight and wiped `/tmp`**, taking the 300 questions with it. Confirmed irrecoverable — agent transcripts contained only summaries, not question text. Bank remained at 1,632.

**Lesson for next time:** writer agents should output directly to the project folder (a persistent Dropbox-synced path), not `/tmp`, so /tmp wipes / VM reboots don't kill the work. The reviewer-result files can stay in /tmp (cheap to regenerate), but the question content is the work product and must persist.

### Pass cascade (2026-05-11)
- Pass mechanic now cascades through ALL players instead of just the next one. Long Question AND Theme Round rounds support Pass; Bid Round does not (by design — wager already covers risk).
- If player 1 passes, the question goes to 2, then 3, then 4; first player to answer correctly gets +5; if none catch it, question ends.
- Implementation: tracks `state.originalPlayerIdx` so that when rotation returns to the original, the question is revealed.

### Specialist-agent batch (2026-05-11)
- Launched 10 topic-specialist agents in parallel — one per topic — each tasked with writing 40 fresh questions (20 hard + 20 standard), reading the existing bank first to avoid duplicates and WebFetch-verifying any uncertain fact.
- First wave (7 of 10) added 280 questions cleanly (Geography, History, Cinema, Cricket, Mythology, Polity, Business); 2 subsequently dropped (1 leftover from earlier batch with drafting commentary, 1 cross-category Yesudas duplicate). Sanity sweep on first wave: 3 flagged for drafting commentary.
- Three agents hit a Claude account rate-limit at ~2pm; relaunched after reset; Books / Music / General added 120 more questions. Zero drafting-commentary flags on the second wave.
- **Net specialist-batch additions: +398** (out of 400 attempted; 2 dropped). All 10 topics now well-stocked.
- Bank now at **1,632 questions** total; 679 hard (~42%); today's adds total 653 (255 from morning all-in-one batch + 398 from specialist batch).
- The specialist-agent approach proved markedly better than the morning's all-in-one Python script: cleaner output, no hallucinated people, no song-attribution errors, no leaked drafting commentary in the second wave.

### 400-question batch and fact-check 2 (2026-05-11)
- 400 new questions written and added (200 hard + 200 standard, distributed across categories).
- 5 verification agents (Cricket+Cinema, History+Polity, Geo+Business, Myth+Music, Books+General) checked both **novelty** (vs the pre-existing bank) and **accuracy** (with Wikipedia/ESPNcricinfo WebFetch).
- Reports surfaced ~90 accuracy issues + ~60 duplicates. Quality drop versus earlier batches: roughly 35% of the 400 were either factually wrong or already covered.
- Notable patterns: drafting commentary leaked into question text (~10 instances); fabricated people (Meg Whitman as Indian-American, "Maurice Sami" Chanel CEO, SP Charan as deceased); wrong birth-death years across 20+ music biographies; ~20 famous-person duplicates with earlier batches (Pichai, Nadella, Sen, Roy, Tagore, etc.).
- Aggressive cleanup applied: 145 dropped (clear duplicates + fabricated questions), 68 patched (simple factual fixes). Net useful additions: 255.

### Fact-check pass (2026-05-10)

Five parallel research agents (one per category-pair) reviewed all 985 questions against training knowledge + Wikipedia/ESPNcricinfo. Found ~95 factual errors. Applied 91 corrections across ~85 questions; dropped 6:
- `c023`, `c075` — Virat Kohli questions with broken/contradictory descriptors (wrong birthplace and role).
- `h032`, `h093` — unfinished thinking-out-loud text accidentally left in question fields ("wait, mixed it up. Let me try again.")
- `u041` — duplicate of `u039`.
- `n060` — self-contradictory Param Vir Chakra question.

Notable factual fixes:
- **Cricket**: c015 (Harbhajan hat-trick Eden Gardens, not Wankhede), c067 (Hanuma Vihari 23* off 161 balls — I'd confused balls-faced with runs), c065 (Chahal 6/42 vs Aus, not 6/25 vs SA), c066 (Manish Pandey debut vs Zim not SL), hc03 (Sehwag 195 first innings not second), hc19 (Sandhu didn't dismiss Greenidge first-ball).
- **Cinema**: f024 (Don 1978 not 1979), f039/f044 (Salman Khan Indore-born 1965, not Mumbai/Punjab 1947), hf24 (Ben Kingsley's father Gujarati, not mother), hf25 (Pran Delhi 1920-2013, not Karachi 1934-2020), hf26 (Amjad Khan Peshawar not Banaras), hf28 (Vyjayanthimala Madras 1933 not Mumbai 1929), hf40 (Joy Mukherjee Jhansi 1939-2012).
- **History**: h094 (Second Battle of Panipat 5 Nov 1556 not 25 Dec), hh02 (Sarfaroshi by Bismil Azimabadi, popularised by Ram Prasad Bismil), hh36 (Tarabai descriptors rewritten), hp01 (Savarkar wrote Hindutva at Ratnagiri not Andamans), hp14 (Emergency signed 25 June not 26), hp19 (Meira Kumar from Bihar not AP — south_india tag removed).
- **Polity**: p005 (Chief Election Commissioner not Chief Commissioner), p009 (Morarji didn't lose no-confidence; resigned).
- **Geography**: g043 (Pangong Tso ~40/50 not 1/3-2/3), hg15 (Sambhar produces far less than 9% of salt).
- **Business**: b005 (Keshub Mahindra is uncle not cousin of Anand; chairman 1963-2012), b022 (Vijay Mallya Kolkata-born not Mangalore), b037 (Cipla founded by KA Hamied not Yusuf), b041 (Bajaj 1945 not 1944), b042 (Hero Honda at Delhi/Dharuhera not Ludhiana), hb16 (JC Mahindra co-founded M&M itself), hb27 (Sumant Moolgaokar was TELCO not Tata Group chair), hb30 (Ajay Banga joined Mastercard 2009, CEO 2010-20), hb32 (Arvind Krishna AP 1962 not Chennai 1965).
- **Mythology**: m010 (Balarama as 8th not 7th avatar), m026 (Kamsa killed 6 not 7), m028 (Indrajit wounded Lakshmana, didn't kill him).
- **Music**: heavy fixes — u008 (RD Burman films corrected; "Don" was Kalyanji-Anandji), u014 (Manna Dey song fixed; "Lagi Tumse Mann Ki Lagan" is Rahat Fateh Ali Khan), u027 (Anuradha Paudwal year + songs), u028 ("Tujhe Dekha Toh" is Kumar Sanu, not Udit Narayan), u031/u032/u033/u034/u035/u036/u037/u042 (many birth-death years and credits corrected), hu01 (Allauddin Khan c. 1881 not 1862), hu03 (Begum Akhtar Padma Shri 1968 + Padma Bhushan 1975 posthumous), hu07 (Haveli Sangeet is a tradition, not a raga), hu19 (Kishori Amonkar Jaipur-Atrauli not Kirana; 1932-2017 not 1931-2009), hu20 (Mallikarjun Mansur 1910-1992), hu21 (Kumar Gandharva died 1992 not 2009), hu24 (Jaidev 1918-1987, not brother of Madan Mohan).
- **Books**: k015 (Anita Desai Mussoorie-born, Bengali father German mother), k017 (Vikram Chandra's sister is Tanuja, not Anuradha), k036 (Karanth died 1997), k037 (Tarashankar 1898-1971; Ganadevta 1943), k041 (Nirala 1899-1961), k045 (Dharmavir Bharati 1926-1997, chief editor not founder), k046 (Buddhadeva Bose 1908-1974; Kavita Bhavan at Rasbehari Avenue), hk30 (Bibhutibhushan 1894-1950).
- **General**: hn30 (JN Chaudhuri East Bengal not Karnataka; reached General not Major General), n040 (Devendra Jhajharia gold Athens 2004 + gold Rio 2016 + silver Tokyo 2020), n041 (Mariyappan silver Tokyo 2020 not gold).

All 12 Long Tail callback questions verified factually correct.

### Iranian Mode (2026-05-23)

**Bank now at 1,944 questions** (was 1,632). Net add: **+312** new internationally-friendly questions across five new theme tags.

Designed for playing with two Iranian friends (Telli + Taymaz) plus mixed Indian + Iranian + international company. A manual "Iranian Mode" toggle in Settings (default OFF) flips the picker into an internationally-friendly pool.

**New themes added:**
- `iran_only` — 60 questions (Persian history, literature, cinema, sport, science, geography, food)
- `india_iran_bridge` — 69 questions (Parsis, Mughal-era Persian, Indo-Persian poetry, Persian loanwords, Nadir Shah/Kohinoor, Indo-Persian cuisine, Chabahar)
- `etymology` — 30 questions (English-word origins from Persian / Arabic / Hindi / Tamil / Sanskrit — verified via etymonline)
- `world` — 112 questions (world geography, world history, world cinema, world music, world sport, world business, world science, world books)
- `usa` — 50 questions (presidents, NBA / NFL / MLB, Hollywood, US history & geography, Silicon Valley)

**Mode mechanics** (in `app.js`):
- `state.iranianMode` boolean, default false. Toggle in Settings: `#iranian-mode` checkbox.
- When ON, `nextQuestion()` filters every pass through `iranianModeFilter()`:
  - If current player's name (case-insensitive) is in `IRANIAN_PLAYERS = ['telli', 'taymaz']`, allowed themes = `{iran_only, india_iran_bridge, world, usa, etymology}`.
  - Other players: allowed = `{india_iran_bridge, world, usa, etymology}` — no pure Iran.
  - India-specific topics (cricket, cinema, history etc.) are excluded entirely.
- Theme-round dropdown swaps to `IRANIAN_THEME_OPTIONS` (World / USA / Word Origins / India ↔ Iran). If a previously-picked India theme is no longer valid, it snaps to the first available.
- Long Tail / callback round is **skipped** at end of game in Iranian Mode (existing callbacks are India-anchored connections).
- Existing 1,632 questions stay in the off-mode pool unchanged. Toggle is non-destructive.

**Production process:** 6 batches (`iran_only`, `bridge`, `etymology`, `world_a`, `world_b`, `usa`) generated in two waves of 3, each batch through a paired **writer-then-fact-checker** agent (Wikipedia / etymonline WebFetch verification). All draft and review JSON files preserved in `iran_mode_batches/`. Cross-batch dedupe caught 9 answer collisions (mostly American figures appearing in both `world_b` and `usa`); resolved by dropping the world-batch versions (kept "Amazon" in both — river vs company).

**Wave totals:**
- Writer outputs: 320 (60 + 60 + 30 + 60 + 60 + 50)
- After fact-check patches: still 320 (no drops by reviewers)
- After cross-batch dedupe: **312** appended to `questions.json` (and regenerated `questions.js`)
- One forced override: `ir008` (Darius wrongly framed as Cyrus's son — checker marked borderline accept; I patched to factual phrasing)

**Files changed:**
- `questions.json` (+312 questions; backup at `questions.json.bak_before_iran_mode`)
- `questions.js` (regenerated from updated JSON; backup at `questions.js.bak_before_iran_mode`)
- `app.js` (added Iranian-mode state, picker filter, theme-option swap, Long Tail skip, change listener)
- `index.html` (Iranian-mode checkbox + hint in Settings card)
- `iran_mode_batches/` (workspace with all 6 draft + review + staged JSON files + `apply_fixes.py`)

**Smoke-tested (headless, in Python):** filter excludes 0 India-topic questions for non-Iranian players, 60-question delta between Telli/Taymaz and non-Iranian pools (= iran_only count), 252 questions available to non-Iranian player in Iranian Mode, 312 to Telli/Taymaz. Not yet click-tested in a browser — Sharan to verify on next play-test.

**Live at commit `11d7438`** (pushed 2026-05-23): https://sharanidli.github.io/family_quiz/

### Long Tail callback expansion (2026-05-23)

Audit of the 12 existing `callback: true` questions (`lt01`–`lt12`) showed reasonable category spread but a small-N problem: with only 12 callbacks, the same handful (Bharat Ratna, Nobel) recur across sessions.

Added **15 new callbacks** (`lt13`–`lt27`) via the same writer + fact-checker pair pattern. Coverage filled the genuine gaps:

| Category | New IDs |
|---|---|
| Cinema | lt13 Dadasaheb Phalke, lt14 Hindi cinema trinity, lt15 Salim-Javed |
| Cricket | lt16 spin quartet, lt17 Indian captains with ICC titles |
| Business | lt18 Tata acquisitions, lt19 Indian-origin global CEOs |
| Geography | lt20 Cities on the Ganga, lt21 Seven Sisters |
| ISRO / modern science | lt22 ISRO missions |
| Mythology / literature | lt23 Pandavas, lt24 Jnanpith winners |
| Religion | lt25 Sikh Gurus, lt26 Bhakti poet-saints |
| Cuisine | lt27 GI tags |

Fact-checker caught one slip: lt20 originally listed Kolkata as a Ganga city, but Kolkata sits on the Hooghly distributary; dropped Kolkata, retained the four UP/Bihar cities. Otherwise clean (14 of 15 accepted as written).

**Callback pool now 27** (was 12). Target ~50–60 over time; this is the first slow batch.

Bank size after callback add: **1,959 questions**.

### Long Tail callback expansion v2 (2026-06-04)

Added **30 more callbacks** (`lt28`–`lt57`) via the same writer + fact-checker pair pattern. **Callback pool now 57** — inside the 50–60 target.

| Category | New IDs |
|---|---|
| Cricket | lt28 2011 WC squad, lt29 Fab Five Test batting, lt30 women's cricket |
| Sport beyond cricket | lt31 hockey golds, lt32 chess champs (Anand → Gukesh), lt33 badminton lineage, lt34 wrestlers |
| Polity | lt35 Indian Presidents, lt36 Constitution Drafting Committee |
| Princely states | lt37 integration post-1947 |
| Geography | lt38 major dams, lt39 IVC sites in India |
| Mythology / literature | lt40 Dashavatara, lt41 Tagore works, lt42 Premchand works |
| Music | lt43 Hindustani gharanas, lt44 AR Rahman scores, lt55 tabla maestros, lt56 female playback singers, lt57 qawwali greats |
| Cinema | lt45 Hindi film music directors, lt46 iconic villains, lt47 Tamil mega-stars, lt48 Bengali masters (beyond Ray) |
| Business / tech | lt49 Reliance milestones, lt50 IT Big Four, lt51 Indian unicorns |
| Science / Modern India | lt52 atomic+space architects, lt53 Pokhran tests, lt54 Green Revolution |

Fact-checker caught 6 patches: lt32 (Anand is Chennai-born, not Coimbatore; GM was 1988 not 1987), lt36 (Madhava Rao vs B.N. Rau confusion, plus replacement context), lt37 (Junagadh plebiscite was 1948 not 1947), lt45 (RD Burman did Sholay solo, not as a duo — writer self-flagged), lt54 (C. Subramaniam was Union Minister, not TN state), lt38 (Nehru's Bhakra phrasing tightened). 24 of 30 accepted as written.

Bank size after v2 add: **1,989 questions**.

### Infinite bounce + Pounce & Bounce + Connect round + freshness selector + 143 new Qs (2026-07-09)

Big feature + content session. **Bank now at 2,132 questions** (was 1,989; +143 net).

**Four new game features (in `app.js`, `index.html`, `style.css`):**

1. **Infinite bounce is now the default for Long & Theme rounds.** Turn control follows the correct answer. New `state.anchorIdx` tracks the last correct answerer; each question's starting player = `(anchorIdx + 1) % n`. Set in `markRight` (direct or pass-attempt correct → anchor = that seat), in `cascadeToNext` (nobody got it → anchor = original asker, so next starts one seat past them = **tie-break rule (a)**), and in `settlePounce`. `startRound` seeds `anchorIdx = n-1` so Q1 goes to player 0. Round length still governed by `count`; only *who* changes. Bid rounds keep fixed rotation.

2. **Pounce & Bounce — per-round toggle, voice-free.** Each round row (except Connect) has a "Pounce & Bounce" checkbox, default OFF; sets `r.pounce`. When on, a `⚡ Pounce` button shows on every live question. Host taps it → taps who pounced → pouncer answers → **Right (+1×base) / Wrong (−2×base)** (deliberately asymmetric so people only pounce when confident; changed from the initial 2×/−1× at Sharan's request same day). base = 10 (long/theme) or the wager (bid). A pounce ends the question; correct → control follows the pouncer, wrong → control stays with original asker. Deliberately uses the same host-adjudicated pattern as Connect so browser STT is never in the loop (STT unreliability was the blocker Sharan flagged).

3. **Connect round type — per-player infinite bounce (redesigned same day at Sharan's request).** New "+ Connect" round button. Each connect starts with one player (infinite-bounce start seat) who sees clue 1 and chooses: **✓ Got it** (host confirms → wins `CONNECT_POINTS[revealed]` = **15 / 10 / 5** for 1/2/3 clues, connect ends, control follows them), **✗ Wrong** (0 pts, forfeits, bounces to next player who inherits the revealed clues), or **Pass** (reveal the next clue and *keep control*; on the last clue, Pass hands off to the next player). Bounces around the ring; if it returns to the starter with no correct answer → nobody got it, next connect starts one seat past the starter (tie-break a). Shared monotonic clue counter (`state.connectClueIdx`); whoever is in control sees all clues revealed so far. New schema: `{connect:true, topic:"connect", clues:[3], answer, accept, explanation}`. Connects live in their own `state.pool.connect`. Functions: `askConnect`, `renderConnect`, `connectGuess`, `connectPass`, `connectBounce`, `connectReveal`, `nextConnect`. Difficulty band: clue 1 leaves a real reasoning path without naming the giveaway (approved via Kalam / Sholay samples). *(Superseded the initial open-buzzer 15/10/5 version.)*

4. **Landing-page "Question set" selector** — the recurring workflow Sharan wants (generate fresh Qs before each session, then play mostly-new). Radio: **(a) All new** (only `created` = today/yesterday), **(b) Mainly new** (~¾ new : ¼ old), **(c) Full database**. "New" computed from each question's `created` date vs the device clock. `countNewRegular()` drives greying: (a) needs ≥40 new, (b) needs ≥25, else both grey out and it defaults to (c). `buildActiveQuestions()` builds the in-play set; `buildPool()` now builds from it. Callbacks always included (Long Tail is source-agnostic).

**Content: +143 fresh questions (stamped `created: 2026-07-09`).** Generated by 7 parallel background writer agents (6 topic pairs + 1 connect writer), each reading the existing bank to dedupe and web-verifying uncertain facts, **writing directly to the project folder** (`new_batch_2026-07-09/`) per the /tmp-wipe lesson. Produced 150 (130 regular + 20 connect); dropped 7 that reused an existing answer (Gukesh, West Bengal, Manu Bhaker, Kolkata, Bhanu Athaiya, Sivaji Ganesan, Tamil) → **143 kept (123 regular + 20 connect)**. ~43% hard, 16 bid-eligible, 30 south_india + 12 languages theme tags. New IDs namespaced `q0709NNN` (collision-checked). Integration script backed up `questions.json`/`questions.js` (`.bak_before_2026-07-09`), reassigned IDs, normalized `accept`, regenerated `questions.js`.

**Verification:** questions.json ↔ questions.js in sync (2,132 each), 0 duplicate IDs, 0 empty answer/accept, all 20 connects have exactly 3 clues, 57 callbacks preserved, `app.js` passes `node --check`, all new functions defined once. **Not yet browser click-tested or pushed to GitHub Pages** — Sharan to play-test today.

### Difficulty tiers, easier batch, current-affairs + personalities themes, default lineup (2026-07-10)

Feedback from the 2026-07-09 play: **questions were too hard**; the Connect round was the hit (they saw 4 of 20). This session made play easier and more contemporary. **Bank now 2,219** (+87 net).

**Scoring / mechanics fixes:**
- **Infinite bounce now awards full points on a bounce** (was +5). A halved bounce score unfairly penalised the seat after a weak player — that seat only ever received the weak player's failed questions as bounces, so it could never earn a direct +10. Now whoever answers correctly (direct or bounce) gets full points. On-screen label: "Bounce — full points".
- **"New" redefined as the latest batch only** (the most recent `created` date among regular questions, if today/yesterday) instead of a rolling 2-day window. So the moment a fresh batch is generated, yesterday's stops counting as "new" — fixes yesterday's too-hard set lingering in "All new".
- **Connects and Theme rounds are now source-agnostic** — they draw from the FULL bank regardless of the "Question set" selector, so a Connect / Films / Business / Current Affairs round works even in "All new" (which otherwise restricts to today's batch). Long Question and Bid rounds still respect the selector.

**Two new themes:** `current_affairs` and `personalities` added to the Theme dropdown.

**Content: +87 net (100 generated, 13 dropped as answer-dupes), stamped `created: 2026-07-10`.** Difficulty-tiered via 5 background writer agents: target 40 easy / 40 medium / 20 hard (`difficulty: 1/2/3`); after dedupe the net was 32 easy / 37 medium / 18 hard. **31 tagged `current_affairs`** (settled 2020-onward events — RCB 2025, Champions Trophy 2025, Payal Kapadia at Cannes, Sengol, Statio Shiv Shakti, Nari Shakti Vandan Adhiniyam, Shubhanshu Shukla, etc.). Writers self-verified facts via web lookup; IDs `q0710NNN`.

**Personalities retro-tag:** a classifier (6 parallel chunks) scanned the whole bank and flagged 1,243 existing questions whose answer is a real person; those were tagged `personalities`. **Personalities theme now ~1,278 questions.**

**Audit (at Sharan's request):** reviewed the finite/high-risk pools that feed today's quiz — 31 current-affairs (30 correct; **fixed 1 date error**: Modi Stadium "2020" → reopened 2021), 20 connects (all sound), 18 new hard (all correct and fair). Easy tier = household names (low risk); Films/Business themes draw from the previously fact-checked bank.

**Default round lineup locked** (in `init()` — `state.rounds`): Long, Theme Films, Bid, Theme Business, Long, Connect, Theme Current Affairs, Bid (3 themes × 4 Qs, 2 long, 2 bid, 1 connect). This exact structure loads every game; specific questions still rotate randomly from the vetted pools (picker untouched).

**Note:** today's 87 new have no `bid_eligible` flags, so Bid rounds in "All new" fall through to serving today's regular questions (all clean self-contained "name this" — fine for Bid). Backups: `*.bak_before_2026-07-10`.

## Multiplayer "next level" idea (not yet built)

Everyone opens the page on their phone; only the active player can buzz / mark the answer; everyone sees the same question and live scores. Requires real-time state sync — static HTML alone can't do this. Cleanest path: **Firebase Realtime Database** (free tier; SDK runs in the browser; ~1-2 hours to wire). Adds: a room-code join flow, a per-device player identity, conditional UI (active player sees buttons, others see "waiting"). Decision deferred — revisit if the family-quiz format becomes a tradition.

## Known limitations

- **Listening accuracy**: ~70% on Indian English in Chrome desktop; lower on mobile/iOS. Manual override always available.
- **Browser support**: Voice + listening best in Chrome/Edge. Firefox doesn't support `SpeechRecognition`. Safari iOS is unreliable.
- **Voice quality**: Browser's built-in TTS — robotic. Premium TTS (ElevenLabs, Google Cloud) would need a backend with API keys, which violates the "static, no key" constraint.
- **Question facts**: Generated from training data; should be sanity-checked over time. Two cricket questions were already corrected during initial generation (Pataudi birth details, Zaheer-vs-Yuvraj confusion).

## Open questions for Sharan

1. After first play-test: are the round-point values right? (10 / 5 / wager)
2. Should the "Pass → next player +5" mechanic apply to Theme Rounds too, not just Long?
3. Auto-reveal delay after voice match — currently 600ms. Too fast / slow?
