# Half-Wit Cast Receiver

This is the Chromecast receiver app for Half-Wit. It displays game content on a TV when cast from the Half-Wit Android app.

## Files

- `index.html` - Main HTML structure with all screen layouts
- `styles.css` - Half-Wit-branded styling
- `receiver.js` - Cast receiver logic and message handling

## Setup Instructions

### 1. Create a GitHub Repository

1. Go to https://github.com/new
2. Create a **public** repository named `halfwit-cast-receiver`
3. Don't initialize with README (we already have files)

### 2. Push the Receiver Files

From your terminal, navigate to the `cast-receiver` directory and run:

```bash
cd cast-receiver
git init
git add .
git commit -m "Initial cast receiver implementation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/halfwit-cast-receiver.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository settings: `https://github.com/YOUR_USERNAME/halfwit-cast-receiver/settings`
2. Scroll down to "Pages" section
3. Under "Source", select `main` branch
4. Click "Save"
5. Your receiver will be available at: `https://YOUR_USERNAME.github.io/halfwit-cast-receiver/`

### 4. Register a Custom Web Receiver

1. Go to the Google Cast Developer Console: https://cast.google.com/publish
2. Sign in with your Google account
3. Pay the one-time $5 registration fee (if not already registered)
4. Click "Add New Application"
5. Select "Custom Receiver"
6. Fill in:
   - **Name**: Half-Wit
   - **Receiver Application URL**: `https://YOUR_USERNAME.github.io/halfwit-cast-receiver/`
7. Click "Save"
8. Copy the **Application ID** (looks like: `ABCD1234`)

### 5. Update the Android App

Open `android/app/src/main/java/com/halfwit/app/services/CastOptionsProvider.kt` and replace:

```kotlin
const val RECEIVER_APP_ID = "YOUR_RECEIVER_APP_ID"
```

With your actual Application ID:

```kotlin
const val RECEIVER_APP_ID = "ABCD1234"  // Your actual ID
```

### 6. Add Test Devices (Development Only)

While your app is unpublished, you need to register test devices:

1. In the Cast Developer Console, click on your application
2. Click "Add Cast Receiver Device"
3. Enter your Chromecast's serial number (found in Google Home app under device settings)
4. Wait 15 minutes for the device to be registered

### 7. Publish (When Ready for Production)

1. In the Cast Developer Console, click "Publish"
2. Once published, any Chromecast can use your receiver

## Testing Locally

For local development testing:

1. Install a local server: `npm install -g http-server`
2. Run from the cast-receiver directory: `http-server -p 8080`
3. Use Chrome's Cast dialog to test (note: actual Chromecast testing requires HTTPS)

## Message Protocol

The receiver expects JSON messages with a `type` field indicating the screen to display:

| Type | Description |
|------|-------------|
| `lobby` | Game lobby with player list |
| `loading` | Loading game indicator |
| `round_countdown` | Round number and countdown |
| `answering` | Answer phase with progress |
| `voting_transition` | "Time to Vote!" transition |
| `matchup_voting` | Voting screen with prompt and answers |
| `matchup_results` | Vote results for a matchup |
| `round_results` | Round scores and leaderboard |
| `game_results` | Final winner and standings |
| `end` | End/disconnect screen |

See `receiver.js` for detailed message structure documentation.

## Customization

- Colors are defined as CSS variables in `styles.css`
- Screen layouts are in `index.html`
- Message handling logic is in `receiver.js`
