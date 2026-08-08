# Backgammon Studio

A polished, single-player backgammon game for the web. Play a classic match or turn on house-rule controls before the game starts.

## What is included

- Complete checker movement, forced bar entry, hits, blocks, bearing off, and legal dice-use priority
- Easy, medium, and hard computer rivals
- Independent 2–4 dice settings for each player
- Power repeats: pairs create four plays and triples create nine
- Director Dice for choosing both players' rolls in advance
- Undo one move or rewind a full turn
- Responsive desktop, tablet, and mobile board
- Room-code multiplayer entry point reserved for the next phase

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`.

## GitHub Pages

The included GitHub Actions workflow publishes the static game automatically whenever `main` is updated. The Pages build can also be checked locally with:

```sh
npm run build:pages
```

## Hosting note

The current game runs entirely in the browser. Real-time room codes will require a small shared service for room state and connections; the interface is intentionally ready for that later phase.
