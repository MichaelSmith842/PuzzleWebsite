# Two Down

Crosswords, Wordle and Strands for two, solved together in real time.

- **Made for phones**: each game fits on one screen with an on-screen keyboard, the invite button opens your share sheet, and "Add to Home Screen" makes it open full-screen like an app.
- **Live co-op**: open the same puzzle and you see each other's letters, cursor and selections as they happen. Each player's letters show in their own ink color.
- **No server, no accounts**: players find each other through the free [PeerJS](https://peerjs.com) broker, then talk directly over WebRTC. Progress is saved in each browser and merges whenever you're both online.
- **Games**: 10 mini crosswords, a shared daily Wordle (plus unlimited free play), and 7 Strands boards.

## Run locally

```bash
npm install
npm run dev
```

## Deploy (GitHub Pages)

1. Push this folder to a GitHub repo on the `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` builds and deploys via `.github/workflows/deploy.yml`. The site appears at `https://<you>.github.io/<repo>/`.

Open the site, enter your name, and send the invite link (it contains your room code) to your partner.

## Adding puzzles

- **Crosswords**: `scripts/gen_crosswords.py` finds 5×5 fills from the word lists in `scripts/words.py`; add the grid and clues to `src/data/crosswords.ts`.
- **Strands**: add a theme to `PUZZLES` in `scripts/gen_strands.py` (spangram + words must total 48 letters), then run `python3 scripts/gen_strands.py > src/data/strands.json`.
- **Wordle**: answers come from `FIVE` in `scripts/words.py`; regenerate with `python3 scripts/gen_words.py`.

## How sync works

`src/sync.ts` keeps room state as a last-writer-wins map (each key stores a value, timestamp and author). The first browser in a room becomes the hub; others connect to it, and if it leaves, the rest re-elect a new hub automatically.
