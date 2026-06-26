# Deal/Breaker Cast Receiver

This is the Chromecast receiver app for **Deal/Breaker**. It displays game content on a TV
when a host casts from the Deal/Breaker Android or iOS app.

It is a static Custom Web Receiver (no build step) — plain HTML/CSS/JS plus a handful of
image and audio assets — served over HTTPS (GitHub Pages) and registered in the Google Cast
Developer Console.

## Files

- `index.html` — screen layouts for every game phase
- `styles.css` — neon-on-black Deal/Breaker styling (cyan `#48C8D0` / fuchsia `#F050D2` on black)
- `receiver.js` — Cast receiver logic and message handling
- `dealbreaker_logo.png` — brand logo (connecting / lobby / loading / end screens)
- `icons/<id>.png` — the 12 player icons (boombox, bow, butterflies, dice, lock,
  lovebirds, magnet, mixtape, perfume, potion, ring, vinyl) + `checkmark.png`; ids match the app's
  `PlayerIcon` enum
- `*.m4a` — `lobby_music` (looped lobby/results music), `countdown_bell`, `bell_ding`

## Message Protocol

The app and receiver communicate on the custom namespace **`urn:x-cast:com.dealbreaker.game`**
(must match `CastManager.CAST_NAMESPACE` in the app). The receiver expects JSON messages with a
`type` field; the contract is defined by the app's `CastManager.kt` (and the iOS
`CastMessages.swift` mirror).

| Type | Screen / action |
|------|-----------------|
| `lobby` | Lobby: access code + player list |
| `loading` | Loading-game indicator |
| `loading_round` | Loading indicator between rounds |
| `round_countdown` | Round number + countdown circle |
| `answering` | "X of Y players have picked" (Deal/Breaker has no answer timer) |
| `reveal` | 3 candidates across the top; the players who picked each drop in one-by-one |
| `round_results` | Round scores + leaderboard (animated reorder to cumulative standings) |
| `game_results` | Final standings + winner/loser badges |
| `end` | Goodbye / disconnect screen |
| `music_start` / `music_fade_stop` / `music_stop` | Lobby/results background music control |
| `play_countdown_bell` / `stop_countdown` / `play_bell` | Sound effects |

On `SENDER_CONNECTED` the receiver replies with `{"type":"receiver_ready"}` so the app knows
it can start sending state.

### `reveal` (pending app-side sender)

The reveal screen is built and renders to this contract:

```json
{
  "type": "reveal",
  "roundNumber": 2, "totalRounds": 6, "category": "Worst First Date",
  "candidates": [ { "candidateId": "c1", "name": "Vernon", "age": 34, "photo": "1980s_30s_vernon.jpg" } ],
  "picks":      [ { "candidateId": "c1", "players": [ { "name": "Marlene", "iconId": "ring" } ] } ]
}
```

The app's `CastBridge` does **not** send this yet — `GamePhase.REVEAL` is still stubbed in
`CastBridge.kt` / `CastBridge.swift`. Until that sender is wired, the TV simply stays on the
answering screen through the reveal phase.

Candidate photos are loaded from a `candidates/<photo>` path; until those images are delivered
to this repo the receiver shows a neon-initial placeholder (same as the app's in-game fallback).

## Setup

### 1. Deploy via GitHub Pages

Enable GitHub Pages for this repo (Settings → Pages → Source: `main`). The receiver will be
served at `https://<user>.github.io/dealbreaker-cast-receiver/`.

### 2. Register a Custom Web Receiver

1. Go to the Google Cast Developer Console: https://cast.google.com/publish
2. Add a new **Custom Receiver** named **Deal/Breaker** with the GitHub Pages URL above.
3. Copy the **Application ID** (e.g. `ABCD1234`).

### 3. Point the apps at the new receiver

Replace the placeholder receiver ID in both apps with the new Application ID:

- Android: `RECEIVER_APP_ID` in
  `android/app/src/main/java/com/dealbreaker/app/services/CastOptionsProvider.kt`
- iOS: `RECEIVER_APP_ID` in `ios/DealBreaker/DealBreaker/Services/CastingService.swift`

(Both currently still hold `A0C5BB02`, which is Half/Wit's receiver — casting will not work
until this is swapped for the Deal/Breaker receiver ID.)

### 4. Register test devices (development)

While unpublished, add your Chromecast's serial number under the application in the Cast
Developer Console and wait ~15 minutes before testing.

## Testing locally

```bash
python -m http.server 8099
```

Open `http://localhost:8099/` in Chrome. The Cast SDK keeps trying to reach the on-device Cast
IPC when run outside a Chromecast, so screens are best previewed by calling the `update*` /
`showScreen` functions directly from the console.

## Customization

- Colors are CSS variables (`--db-*`) at the top of `styles.css`
- Screen layouts are in `index.html`
- Message handling is in `receiver.js`
