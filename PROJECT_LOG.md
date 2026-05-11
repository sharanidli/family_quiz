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

**Question bank now at 979** after fact-check (was 985; 6 broken questions dropped, ~85 patched). 349 hard (~36%), 95 bid-eligible, 12 callbacks. Coverage: Cricket 112, Cinema 116, History 143, Geography 110, Business 94, Polity 68, Mythology 69, Music 73, Books 84, General 110. Theme tags: South India 147, Languages 74.

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
