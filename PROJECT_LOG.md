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
- **Question bank expanded to 326** (101 tagged `difficulty: 3` "hard" / Doddabetta-tricky, 59 `bid_eligible`).
- Voice picker added in Settings; choice persists in localStorage. Mic permission re-prompts on `file://` (will be remembered on HTTPS once on Pages).
- Auto-reveal-on-match removed — green highlight + chime + pulsing Right button now, but the host always confirms.
- **Not yet pushed to GitHub Pages** — Sharan to do this when ready.

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
