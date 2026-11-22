# Attillion

A space-themed game: rarer answers launch your avatar higher, from the Sky through the Stratosphere, Orbit and the Moon, to **1 in an Attillion** past the Moon.

Play it: https://bryandickinson-create.github.io/attilion/

Name the answer nobody else will. 7 prompts, 30 seconds each, up to 100 points a round.
Only the rarer, still-reasonable answers land in the **1 in an Attillion** zone and score 100.

## Files
- `src/prompts.js`, `src/prompts2.js`: 87 topics with answers listed from most to least common. app.js also builds twist versions ("...with no E in it", "...that's two or more words", "...with a double letter") from them, keeping only twists that leave at least 30 answers.
- `src/fx.js`: animated background and reveal effects.
- `src/app.js`: game logic (matching, scoring, computer opponents, Elo, daily dive, challenges, accounts, quick match).

Quick match (live play against someone near your Elo) uses the live room of the Claude-hosted copy of the page, so it does not work on GitHub Pages yet.
- `src/style.css`, `src/index.html`: the page.
- `build.sh`: run `sh build.sh` to make `index.html` and `dist/index.html` (one file, works opened directly or on GitHub Pages) and `dist/artifact.html` (preview copy).

## How rarity works (guess, open to change)
- Each answer's share of players is estimated from its position in the list using a Zipf curve, assuming 92% of players give a valid answer.
- Each list has a "familiar" part (first 65 answers). Answers from 75% of the way down that part, and everything past it, score 100 (1 in an Attillion); everything else is capped at 97. The most common answer → 2 points. In between, points follow a log scale of estimated share, shown as an altitude from the ground up past the Moon.
- Answers players actually give are counted and blended into the estimate (the curated list counts as 200 virtual answers). In this build the counts live in each browser; with a server they'd be global.
- The Daily Dive and friend challenges use the fixed list only, so both players face the same rarity.
- Typos within 1 letter (2 for long words), plurals, "the", accents and punctuation are forgiven. Answers not on the list score 0.

## Computer opponents
Average scores over 500 simulated games: see app.js BOTS (simulated averages listed in the thread) (out of 700). Asteroid / Comet / Star / Black Hole, Elo 800 / 1100 / 1400 / 1700.

## Elo
Everyone starts at 1000. K = 40 for the first 10 games, then 24. Win/loss/tie decided by total points.

## What still needs a server (next step)
This build stores accounts, Elo, history and the leaderboard in the browser (localStorage). Friend games work through challenge codes/links with no server. To get real online accounts, a global leaderboard, live simultaneous rooms and global rarity counts, the plan is:
1. GitHub repo + GitHub Pages for the static site.
2. Supabase project: auth (email or magic link), tables `profiles(elo, peak, wins, losses)`, `matches`, `daily_results(date, user, score)`, `answer_counts(prompt_id, answer_idx, n)`, plus Realtime channels for live rooms. Scoring and Elo should run in a Supabase function so scores can't be faked.
