# RufzWeb

Browser-based adaptive CW callsign copying trainer, in the spirit of
[RufzXP](https://www.rufzxp.net/) by DL4MM and IV3XYM.

A call is sent, you type what you heard and press Enter. Copy it clean and the
speed goes up; miss it and the speed comes down. After 50 calls you get a score.

Not affiliated with RufzXP. Scores are not comparable — see *Scoring* below.

## Running

```
npm install
npm run dev      # dev server
npm test         # unit tests for morse timing, scoring, callsign generation
npm run build    # production bundle
```

## How it works

**Keying** — [`src/audio/cwEngine.ts`](src/audio/cwEngine.ts) drives one
oscillator through a gain node and schedules every element up-front against
`AudioContext.currentTime`, so timing is sample-accurate regardless of what the
main thread is doing. Elements are shaped with a raised-cosine envelope; the
ramp length is the "keying hardness" control, clamped so it always fits inside
an element even at 735 cpm.

**Timing** — [`src/game/morse.ts`](src/game/morse.ts) uses the PARIS standard:
1 dot = 1.2 / wpm seconds, and 1 wpm = 5 cpm, so 1 dot = 6.0 / cpm seconds.
Speeds are shown in cpm (RufzXP's native unit) with wpm alongside.

**Errors** — Levenshtein distance between sent and typed, so a dropped
character costs one error instead of shifting everything after it.

**Speed adaptation** — [`nextSpeed`](src/game/scoring.ts). A clean copy climbs
one step; each error costs a step going the other way. The step is either a
fixed cpm value or a proportion of the current speed (default 6%), clamped to
25–735 cpm.

**Callsigns** — RufzXP's ~35,000-call database is encrypted and cannot be
reused, so [`src/game/callsigns.ts`](src/game/callsigns.ts) generates
structurally realistic calls from real prefixes, weighted roughly by on-air
population. Import your own list (one call per line; `MASTER.DTA` and
`MASTER.PED` both work, trailing comma-separated fields are ignored) from the
setup screen.

## Scoring

The RUFZ 3.2 manual documents the *shape* of the formula but not its constants:

- quadratic in the sending speed
- linear in the length of the callsign
- divided by `(errors + 1)²` — 1 error is a quarter, 2 is a ninth, 3 is a
  sixteenth, 4 or more scores nothing
- reduced logarithmically by how long the operator took to type
- halved if the call was repeated

[`src/game/scoring.ts`](src/game/scoring.ts) reproduces that shape with our own
scale factors, tuned so a clean 5-character call at 250 cpm is worth about 1000
points. **Scores here are not comparable with real RufzXP results.** Matching
them would mean curve-fitting against a set of real runs.

## Keys

| Key | Action |
| --- | --- |
| `Enter` | Send what you typed, move to the next call |
| `F6` or `Ctrl+R` | Repeat the current call at half points |
| `Esc` | Abort the run |

`F6` is what RufzXP uses; `Ctrl+R` is there because some browsers swallow `F6`.

## Not implemented

- **Global leaderboard.** Needs a backend, and a score posted from a browser is
  unverifiable. The run seed is already recorded, so the intended path is a
  server that generates the sequence from a seed and replays the operator's
  keystroke log.
- **HST competition use.** IARU high-speed telegraphy events run the sanctioned
  binary. This is a training tool.
- **Mobile.** Soft-keyboard latency corrupts the typing-time term in the score.
  Desktop keyboard only.
