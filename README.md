# Two Down

Crosswords, Wordle and Strands for two, solved together in real time.

- **Made for phones**: each game fits on one screen with an on-screen keyboard, the invite button opens your share sheet, and "Add to Home Screen" makes it open full-screen like an app.
- **Live co-op**: open the same puzzle and you see each other's letters, cursor and selections as they happen. Each player's letters show in their own ink color.
- **No server of our own, no accounts**: changes relay through a free public MQTT broker over a secure WebSocket, so it works on any network. Each player also leaves a saved snapshot there, so progress syncs even when you're not online at the same time.
- **Just us**: everyone who opens the site shares one room, with no invites needed. Local development (`npm run dev`) uses a separate room.
- **Games**: 35 crosswords (10 minis, 15 medium 7×7, 5 hard 9×9, and 5 "Just for us" puzzles built from law, books and code), a shared daily Wordle (plus unlimited free play), and 7 Strands boards.

## Run locally

```bash
npm install
npm run dev
```

## Deploy (GitHub Pages)

1. Push this folder to a GitHub repo on the `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` builds and deploys via `.github/workflows/deploy.yml`. The site appears at `https://<you>.github.io/<repo>/`.

Open the site, enter your name and pick a color. Your partner does the same on their phone, and you're in.

## Adding puzzles

- **Crosswords**: minis come from `scripts/gen_crosswords.py`; bigger grids from `scripts/gen_big_crosswords.py` (needs `pip install wordfreq`; `--theme law,books,code` biases toward our fields). Add grids and clues to `src/data/crosswords.ts` (minis) or `src/data/crosswords-more.json`, then run `python3 scripts/check_crosswords.py` to confirm every answer has a clue.
- **Strands**: add a theme to `PUZZLES` in `scripts/gen_strands.py` (spangram + words must total 48 letters), then run `python3 scripts/gen_strands.py > src/data/strands.json`.
- **Wordle**: answers come from `FIVE` in `scripts/words.py`; regenerate with `python3 scripts/gen_words.py`.

## How sync works

`src/sync.ts` keeps state as a last-writer-wins map (each key stores a value, timestamp and author), saved in localStorage. Changes are published to `twodown-v2/<room>/op` on a public MQTT broker (EMQX, with HiveMQ as fallback). Each player keeps a retained, gzipped snapshot at `state/<userId>` and a presence message at `presence/<userId>`. Because it's a public broker, anyone who guessed the room name could read puzzle letters and first names.
