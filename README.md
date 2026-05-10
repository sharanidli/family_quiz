# Not Such A Tough Quiz Also

A family quiz, India-soaked. One device, voice host, listen-and-judge.

## What it does

- Enter player names, pick rounds, hit Start.
- A voice host reads each question aloud and calls on the next player by name.
- Players answer aloud. The browser listens and tries to match; if it matches, it auto-marks the answer right. The host can always override with the **Right / Wrong / Pass** buttons.
- Three round types:
  - **Long Question** — Joy-Bhattacharjya-style: a paragraph of context that funnels to a clever ask. Right = +10. Pass = next player can try for +5.
  - **Theme Round** — pick a topic (Cricket, Cinema, History, etc.); a fixed number of questions on that theme, taken in turn. Right = +10.
  - **Bid Round** — wager 5, 10, or 20 *before* seeing the question. Right wins your wager, wrong loses it.

## How to play locally

1. Open `index.html` in **Chrome** or **Edge** (best browsers for voice + listening).
2. The first time, the browser will ask permission for the microphone — say yes.
3. Set up players, pick your rounds, hit **Start Quiz**.

You don't need a server, internet, or any install. The whole thing runs from the static files.

## How to publish to GitHub Pages

So your in-laws can play from a phone with just a link:

1. Create a new repo on GitHub (call it whatever — `quiz`, `not-such-a-tough-quiz`, etc.). Make it **public** (free GitHub Pages requires public, unless you have GitHub Pro).
2. From a terminal in this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial quiz build"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. Wait a minute. Your quiz will be live at:
   `https://<your-username>.github.io/<your-repo>/`

Share that link. Anyone with it can play.

## Adding more questions

`questions.json` is just a list. Each question looks like:

```json
{
  "id": "c026",
  "topic": "cricket",
  "bid_eligible": true,
  "question": "On a balmy afternoon at Lord's...",
  "answer": "Kapil Dev",
  "accept": ["kapil dev", "kapil"],
  "explanation": "Optional one-line context shown after the answer."
}
```

Notes:
- `id` must be unique across the file.
- `topic` should be one of: `cricket`, `cinema`, `history`, `geography`, `business`, `polity`, `mythology`, `music`, `books`, `general`. (The Theme Round picker uses `cricket`, `cinema`, `history`, `geography`, `business`, `polity`.)
- `accept` is a list of strings the listener will fuzzy-match the spoken answer against. Include common nicknames, variants and just the surname. Lowercase is fine.
- `bid_eligible: true` flags questions with very clean, unambiguous answers, suitable for the wagering round. Optional.
- `explanation` is optional — appears under the answer at reveal time.

Push to GitHub and Pages updates within a minute.

## Voice & listening — what to expect

- Both features depend on the browser. **Chrome** and **Edge** on desktop work best. Safari on iPhone is iffy. Firefox doesn't expose listening at all.
- The voice is the browser's built-in TTS — robotic by nature. The **Voice** dropdown in Settings lets you pick from the voices installed on your system. To get a proper Indian-English voice on Windows: Settings → Time & Language → Speech → Add voices → search "English (India)" → install. Reload the page and the voice will appear in the dropdown. Choice is remembered.
- Listening is **best-effort**. It will mishear "Aurangzeb" as "orange zip" sometimes. The browser's recogniser is the bottleneck — there's no way to dramatically improve it without a paid backend. So: when the browser does match, you'll see a green highlight + chime + the **Right** button will pulse; otherwise, the host clicks Right / Wrong / Pass directly. The host is always the final authority.
- **Mic permission**: Chrome forgets the permission every page load when the page is opened by double-clicking (`file://`). Once you push to GitHub Pages (HTTPS), it's remembered persistently.
- You can turn either feature off in Settings.

## Files

- `index.html` — the page
- `style.css` — styling
- `app.js` — game state, voice host, microphone, fuzzy matcher
- `questions.js` — the loaded question bank (currently 176 questions, ~26 tagged `difficulty: 3` for tougher rounds). Format inside is identical to `questions.json` (kept as a clean reference). Edit either; if you edit the JSON, regenerate the JS with one Python line:
  ```bash
  python3 -c "open('questions.js','w').write('window.QUESTIONS_DATA = '+open('questions.json').read().rstrip()+';\n')"
  ```
- `README.md` — this file
- `PROJECT_LOG.md` — Claude's session notes

## Roadmap (if we want to keep building)

- More round types: Connection, Pounce, Antakshari-chain.
- Audio-clue questions (tiny mp3 stubs in the JSON).
- Per-team mode (groups bid together).
- Persistent score history across games.
