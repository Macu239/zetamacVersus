# Zetamac Versus

Real-time, two-player [Zetamac](https://arithmetic.zetamac.com). Both players see the same problem at the same moment. The first correct answer scores a point, then both players get the next problem.

## Features

- Rooms with a 5-character code, plus an invite link (`/?code=ABCDE`)
- Host-adjustable settings, synced live to the guest:
  - Duration: 30 / 60 / 120 / 300 s or custom (10 to 600)
  - Addition and multiplication on/off, each with its own number ranges
  - Subtraction and division on/off. They are generated as addition and multiplication in reverse, so answers are never negative and always whole numbers.
- No Enter key, as in Zetamac: every keystroke is checked on the server
- The server decides everything (problems, answers, scores, clock), so both screens always agree
- Disconnects pause the game. The player has 30 s to reconnect (refreshing the page rejoins); after that the opponent wins by forfeit.
- Results show points, average solve time, and fastest solve. Rematch keeps the same settings.

## Project layout

```
shared/   types, settings validation, seeded problem generator (used by both sides)
server/   Node + Express + Socket.IO: rooms, game state machine, event handlers
client/   React + Vite UI: Home, Lobby, Game, Results
```

## Run locally

```bash
npm install
npm run dev        # server on :3001, client on http://localhost:5173
```

Open http://localhost:5173 in two tabs. Each tab is a separate player, because the session is stored per tab. To play from another laptop on the same Wi-Fi, open `http://<your-LAN-IP>:5173` on it.

## Tests

```bash
npm test           # unit tests (shared) + two-client integration tests (server)
npm run typecheck
```

## Production

```bash
npm run build      # builds client/dist
npm start          # one Node process serves the client and Socket.IO on $PORT (default 3001)
```

## Deploy on Render (free)

The whole app runs as one free Render web service: the same process serves the page and the game server, so there is no CORS or server URL to configure.

1. Push this repo to GitHub.
2. In the Render dashboard choose **New > Blueprint**, pick the repo, and apply. `render.yaml` creates the service with the build and start commands and the health check.
3. Open `https://<service-name>.onrender.com`. That is the address both players use.

On the free plan, the service sleeps after about 15 minutes without traffic. The next visitor waits 30 to 60 seconds while it wakes up, and the page says so. Rooms are kept in memory, so a redeploy ends any game in progress.

Any other host that supports WebSockets also works. A `Dockerfile` is included.

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | reflect origin | Comma-separated origins allowed when the client is hosted elsewhere |
| `VITE_SERVER_URL` | same origin | Build-time server URL for a separately hosted client |
