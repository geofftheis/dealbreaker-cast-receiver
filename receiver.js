/**
 * Deal/Breaker Cast Receiver
 *
 * This receiver app displays game state on a TV when cast from the Deal/Breaker app.
 * It receives JSON messages via the custom namespace and renders the appropriate screen.
 *
 * The message contract is defined by the app's CastBridge / CastManager
 * (android/.../services/CastManager.kt and the iOS CastMessages.swift mirror).
 */

// Custom namespace for Deal/Breaker game messages — MUST match CastManager.CAST_NAMESPACE.
const DEALBREAKER_NAMESPACE = 'urn:x-cast:com.dealbreaker.game';

// Screen elements
const screens = {
    connecting: document.getElementById('connecting-screen'),
    lobby: document.getElementById('lobby-screen'),
    loading: document.getElementById('loading-screen'),
    countdown: document.getElementById('countdown-screen'),
    roundIntro: document.getElementById('round-intro-screen'),
    board: document.getElementById('board-screen'),
    roundResults: document.getElementById('round-results-screen'),
    gameResults: document.getElementById('game-results-screen'),
    end: document.getElementById('end-screen')
};

let currentScreen = 'connecting';

/**
 * Show a specific screen and hide all others
 */
function showScreen(screenName) {
    // If a round intro is mid-animation and another phase takes the screen, cancel it.
    if (introPlaying && screenName !== 'roundIntro') {
        clearIntroTimeouts();
    }
    // Leaving the board cancels any in-progress reveal stagger.
    if (currentScreen === 'board' && screenName !== 'board') {
        clearBoardTimeouts();
    }

    Object.keys(screens).forEach(name => {
        if (screens[name]) {
            screens[name].classList.remove('active');
        }
    });

    if (screens[screenName]) {
        screens[screenName].classList.add('active');
        currentScreen = screenName;
        console.log('Showing screen:', screenName);
    }
}

// ── Per-icon visual tuning ──────────────────────────────────────────
// Each icon PNG has different amounts of transparent padding and visual
// weight. These ratios were hand-tuned (mirrors the Android/iOS app tuning
// in Components.kt / DealBreakerComponents.swift) so every icon looks
// consistently sized and centred. Values are fractions of the container
// size so they scale proportionally to any display size.
const ICON_SIZE_RATIO = {
    ring: 0.94,
    lovebirds: 0.90,
    bow: 0.86,
    lock: 0.85,
    perfume: 0.84,
    butterflies: 0.83, magnet: 0.83, vinyl: 0.83,
    flask: 0.81, mixtape: 0.81,
    dice: 0.80,
    boombox: 0.75
};
const ICON_OFFSET_Y = {
    butterflies: 0.01,
    boombox: -0.01, lovebirds: -0.01,
    perfume: -0.02,
    magnet: -0.03,
    flask: -0.04, lock: -0.04, ring: -0.04
};
const ICON_OFFSET_X = {
    ring: 0.03,
    bow: -0.01
};
const DEFAULT_SIZE_RATIO = 0.86;

/**
 * Create an <img> element for a player icon, scaled and offset so it
 * looks visually centred at any size.
 */
function createIconImg(iconId) {
    const img = document.createElement('img');
    img.src = 'icons/' + iconId + '.png';
    img.alt = iconId.replace(/_/g, ' ');
    img.className = 'player-icon';

    const scale = ICON_SIZE_RATIO[iconId] || DEFAULT_SIZE_RATIO;
    const offX  = ICON_OFFSET_X[iconId] || 0;
    const offY  = ICON_OFFSET_Y[iconId] || 0;

    // scale() shrinks the image within its layout box (box stays full size).
    // translate() offsets are relative to the element's own size after scale,
    // so we convert our container-fraction offsets to element-fraction by
    // dividing by scale.
    const txPct = scale !== 0 ? ((offX / scale) * 100).toFixed(2) : 0;
    const tyPct = scale !== 0 ? ((offY / scale) * 100).toFixed(2) : 0;
    img.style.transform = `scale(${scale.toFixed(4)}) translate(${txPct}%, ${tyPct}%)`;

    return img;
}

/**
 * Create a player card element
 */
function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card' + (player.isHost ? ' host' : '');

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.appendChild(createIconImg(player.iconId));

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = player.name;

    card.appendChild(icon);
    card.appendChild(name);

    return card;
}

/**
 * Create a leaderboard entry element
 */
function createLeaderboardEntry(player, showRoundScore = true, highlightTotalScore = false) {
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry rank-' + player.rank;
    entry.setAttribute('data-player-id', player.peerId || player.name);

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = '#' + player.rank;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.appendChild(createIconImg(player.iconId));

    const info = document.createElement('div');
    info.className = 'player-info';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = player.name;

    info.appendChild(name);

    // Score section on the right side
    const scoreSection = document.createElement('div');
    scoreSection.className = 'score-section';

    if (showRoundScore && player.roundScore !== undefined) {
        // Large round score in fuchsia (e.g., "+2")
        const roundScore = document.createElement('div');
        roundScore.className = 'round-score';
        roundScore.textContent = '+' + player.roundScore;
        scoreSection.appendChild(roundScore);

        // Pre-create total score element (hidden) for crossfade during reorder
        const totalScoreReplace = document.createElement('div');
        totalScoreReplace.className = 'total-score-replace';
        const pts = player.totalScore === 1 ? 'Pt' : 'Pts';
        totalScoreReplace.textContent = player.totalScore + ' ' + pts;
        scoreSection.appendChild(totalScoreReplace);
    }

    if (highlightTotalScore) {
        // Final game results: just "X Pts"
        const totalScore = document.createElement('div');
        totalScore.className = 'total-score highlighted';
        const points = player.totalScore === 1 ? 'Pt' : 'Pts';
        totalScore.textContent = player.totalScore + ' ' + points;
        scoreSection.appendChild(totalScore);
    }

    entry.appendChild(rank);
    entry.appendChild(icon);
    entry.appendChild(info);
    entry.appendChild(scoreSection);

    return entry;
}

/**
 * Set the height of a two-column leaderboard so flex-wrap fills left column first.
 * Uses ceil(n/2) entries for the left column height.
 */
function setTwoColumnHeight(leaderboard, playerCount) {
    if (playerCount < 5) {
        leaderboard.style.height = '';
        return;
    }
    // Wait for entries to render, then compute height from first entry
    requestAnimationFrame(() => {
        const entries = leaderboard.querySelectorAll('.leaderboard-entry');
        if (entries.length === 0) return;
        const entryRect = entries[0].getBoundingClientRect();
        const gap = 10; // matches gap in CSS
        const leftCount = Math.ceil(playerCount / 2);
        const totalHeight = leftCount * entryRect.height + (leftCount - 1) * gap;
        leaderboard.style.height = totalHeight + 'px';
    });
}

/**
 * Handle incoming game messages
 */
function handleMessage(message) {
    console.log('Received message:', message);

    try {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'lobby':
                updateLobbyScreen(data);
                showScreen('lobby');
                break;

            case 'loading':
                updateLoadingScreen(data);
                showScreen('loading');
                break;

            case 'loading_round':
                updateLoadingRoundScreen(data);
                showScreen('loading');
                break;

            case 'round_countdown':
                updateCountdownScreen(data);
                showScreen('countdown');
                break;

            case 'round_intro':
                playRoundIntro(data);
                break;

            case 'answering':
                // The board owns the screen for the whole answer phase; just keep the
                // submitted-count fresh. (During the intro the board isn't shown yet — the count
                // is applied when the intro hands off to the board.)
                boardCount = { received: data.answersReceived, total: data.totalPlayers };
                if (currentScreen === 'board' && !boardRevealed) updateBoardStatus();
                break;

            case 'reveal':
                revealBoard(data);
                break;

            case 'round_results':
                updateRoundResultsScreen(data);
                showScreen('roundResults');
                break;

            case 'game_results':
                updateGameResultsScreen(data);
                showScreen('gameResults');
                break;

            case 'end':
                showScreen('end');
                setTimeout(() => stopLobbyMusic(), 2000);
                break;

            case 'music_start':
                startLobbyMusic(data.fadeInDurationMs || 2000);
                break;

            case 'music_fade_stop':
                fadeStopLobbyMusic(data.fadeDurationMs || 2000);
                break;

            case 'music_stop':
                stopLobbyMusic();
                break;

            case 'play_countdown_bell':
            case 'play_countdown':
                playSfx('countdown_bell');
                break;

            case 'stop_countdown':
                stopSfx();
                break;

            case 'play_bell':
                playSfx('bell');
                break;

            default:
                console.warn('Unknown message type:', data.type);
        }
    } catch (e) {
        console.error('Error parsing message:', e);
    }
}

/**
 * Update lobby screen with access code and player list
 */
function updateLobbyScreen(data) {
    // Online-only: an access code is always required. Old app versions that
    // don't send one yet (rollout window) no-op rather than render a broken lobby.
    if (!data.accessCode) return;

    const screen = screens.lobby;

    const accessCodeLabelEl = screen.querySelector('.access-code-label');
    const accessCodeEl = screen.querySelector('.access-code');

    // Show formatted access code
    const code = data.accessCode;
    accessCodeEl.textContent = code.length === 6
        ? code.slice(0, 3) + ' ' + code.slice(3)
        : code;
    accessCodeLabelEl.style.display = '';
    accessCodeEl.style.display = '';

    screen.querySelector('.player-count').textContent = data.players.length + '/' + data.maxPlayers + ' players';

    const playerList = screen.querySelector('.player-list');
    playerList.innerHTML = '';

    // Use compact cards when 7+ players so all fit on screen
    playerList.classList.toggle('compact', data.players.length >= 7);

    data.players.forEach(player => {
        playerList.appendChild(createPlayerCard(player));
    });
}

/**
 * Update loading screen for game start
 */
function updateLoadingScreen(data) {
    const screen = screens.loading;
    screen.querySelector('.status').textContent = 'Loading Game...';
}

/**
 * Update loading screen for round loading
 */
function updateLoadingRoundScreen(data) {
    const screen = screens.loading;
    screen.querySelector('.status').textContent = 'Loading Round ' + data.roundNumber + '...';
}

/**
 * Update countdown screen
 */
function updateCountdownScreen(data) {
    const screen = screens.countdown;

    screen.querySelector('.round-number').textContent = data.roundNumber;
    screen.querySelector('.round-category').textContent = data.category || '';
    screen.querySelector('.countdown-number').textContent = data.secondsRemaining;
    screen.querySelector('.total-rounds').textContent = data.totalRounds;
}

// ── Candidate Board (answer phase + reveal) ─────────────────────────
// The persistent 3-candidate display: name on top, photo, then the cumulative characteristics.
// Shown for the whole answer phase with a small "X of Y Players Submitted" status. On reveal the
// characteristics fade out and the players who picked each candidate drop in underneath, one at a
// time (~1.8s apart, left to right) to roughly match the devices.

let boardCandidatesData = [];
let boardCount = { received: 0, total: 0 };
let boardRevealed = false;
let boardTimeouts = [];

function clearBoardTimeouts() {
    boardTimeouts.forEach(id => clearTimeout(id));
    boardTimeouts = [];
}

function updateBoardStatus() {
    const el = screens.board.querySelector('.board-status');
    el.textContent = boardRevealed
        ? 'Who Picked Who?'
        : boardCount.received + ' of ' + boardCount.total + ' Players Submitted';
}

function renderBoard() {
    const container = screens.board.querySelector('.board-candidates');
    container.innerHTML = '';
    boardCandidatesData.forEach(cand => {
        const col = document.createElement('div');
        col.className = 'board-candidate';
        col.setAttribute('data-candidate-id', cand.candidateId);

        const name = document.createElement('div');
        name.className = 'board-name';
        name.textContent = cand.name || '';

        const photoHolder = document.createElement('div');
        photoHolder.className = 'board-photo-holder';
        photoHolder.appendChild(createCandidatePhoto({ name: cand.name, photo: cand.photo }));

        const chars = document.createElement('div');
        chars.className = 'board-chars';
        (cand.characteristics || []).forEach(value => {
            const row = document.createElement('div');
            row.className = 'board-char';
            const bullet = document.createElement('span');
            bullet.className = 'board-bullet';
            bullet.textContent = '•';
            const text = document.createElement('span');
            text.className = 'board-char-text';
            text.textContent = value;
            row.appendChild(bullet);
            row.appendChild(text);
            chars.appendChild(row);
        });

        const picks = document.createElement('div');
        picks.className = 'board-picks';

        col.appendChild(name);
        col.appendChild(photoHolder);
        col.appendChild(chars);
        col.appendChild(picks);
        container.appendChild(col);
    });
}

// Show the board for the answer phase: the 3 profiles + the submitted-count status.
function showBoardAnswering() {
    clearBoardTimeouts();
    boardRevealed = false;
    renderBoard();
    updateBoardStatus();
    showScreen('board');
}

function buildPickerChip(player) {
    const chip = document.createElement('div');
    chip.className = 'board-pick';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.appendChild(createIconImg(player.iconId));
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = player.name;
    chip.appendChild(icon);
    chip.appendChild(name);
    return chip;
}

// Reveal: fade the characteristics out and drop the players who picked each candidate in
// underneath, one at a time (~1.8s apart), grouped left to right — roughly synced to the devices.
function revealBoard(data) {
    clearBoardTimeouts();

    // (Re)build the board if needed — e.g. casting connected mid-reveal.
    if (data.candidates && data.candidates.length) boardCandidatesData = data.candidates;
    if (currentScreen !== 'board' || !screens.board.querySelector('.board-candidate')) {
        renderBoard();
    }

    boardRevealed = true;
    showScreen('board');
    updateBoardStatus();

    // Build hidden picker chips per candidate; collect them left-to-right for the staggered reveal.
    const picksByCandidate = {};
    (data.picks || []).forEach(p => { picksByCandidate[p.candidateId] = p.players || []; });

    const order = [];
    boardCandidatesData.forEach(cand => {
        const col = screens.board.querySelector('.board-candidate[data-candidate-id="' + cand.candidateId + '"]');
        if (!col) return;
        const picksWrap = col.querySelector('.board-picks');
        picksWrap.innerHTML = '';
        (picksByCandidate[cand.candidateId] || []).forEach(player => {
            const chip = buildPickerChip(player);
            picksWrap.appendChild(chip);
            order.push(chip);
        });
    });

    // Fade the characteristics out, then reveal the picks one at a time.
    const charBlocks = screens.board.querySelectorAll('.board-chars');
    charBlocks.forEach(c => { c.style.transition = 'opacity 600ms ease'; c.style.opacity = '0'; });

    boardTimeouts.push(setTimeout(() => {
        charBlocks.forEach(c => { c.style.display = 'none'; });
        let delay = 0;
        order.forEach(chip => {
            boardTimeouts.push(setTimeout(() => chip.classList.add('visible'), delay));
            delay += 1800;
        });
    }, 650));
}

// ── Round Intro Animation ───────────────────────────────────────────
// Mirrors the phones' RoundIntroOverlay: round 1 flies each candidate's photo + name in with a
// bounce ("Candidate #N"); rounds 2-6 fade each candidate in and fly that round's new
// characteristic in underneath. The category sits as a header throughout. It plays once per round
// at the start of answering, then hands off to the answering (submitted-count) screen.

let introTimeouts = [];
let introPlaying = false;
let lastIntroRound = 0;

function clearIntroTimeouts() {
    introTimeouts.forEach(id => clearTimeout(id));
    introTimeouts = [];
    introPlaying = false;
}

// Bouncy spring-ish easing (overshoot) to approximate the app's Compose/SwiftUI spring.
const INTRO_BOUNCE = 'transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1)';

function introFadeTo(el, opacity, ms) {
    el.style.transition = 'opacity ' + ms + 'ms ease';
    el.style.opacity = String(opacity);
}
function introPlaceOff(el, px) {
    el.style.transition = 'none';
    el.style.transform = 'translateX(' + px + 'px)';
    el.style.opacity = '1';
    void el.offsetWidth; // commit the off-screen position before animating in
}
function introSlideIn(el) {
    el.style.transition = INTRO_BOUNCE;
    el.style.transform = 'translateX(0)';
}
function introSlideOffLeft(el, px) {
    el.style.transition = 'transform 600ms ease';
    el.style.transform = 'translateX(' + (-px) + 'px)';
}

function playRoundIntro(data) {
    const round = data.roundNumber;
    // Don't replay for a round we've already shown (e.g. casting (re)connects mid-round).
    if (round === lastIntroRound && (introPlaying || currentScreen === 'answering')) return;

    clearIntroTimeouts();
    introPlaying = true;
    lastIntroRound = round;

    const cands = (data.candidates || []).slice().sort((a, b) => a.candidateId - b.candidateId);
    boardCandidatesData = cands; // the board reuses these candidates after the intro
    const screen = screens.roundIntro;
    const categoryEl = screen.querySelector('.intro-category');
    const labelEl = screen.querySelector('.intro-label');
    const cardEl = screen.querySelector('.intro-card');
    const nameEl = screen.querySelector('.intro-name');
    const charEl = screen.querySelector('.intro-char');
    const photoHolder = screen.querySelector('.intro-photo-holder');

    const off = Math.max(window.innerWidth, 600) * 1.3;

    // Reset all animated pieces to their hidden starting state.
    categoryEl.textContent = data.category || '';
    categoryEl.style.transition = 'none'; categoryEl.style.opacity = '0';
    labelEl.style.transition = 'none'; labelEl.style.opacity = '0'; labelEl.style.transform = 'translateX(0)'; labelEl.textContent = '';
    cardEl.style.transition = 'none'; cardEl.style.opacity = '0'; cardEl.style.transform = 'translateX(0)';
    charEl.style.transition = 'none'; charEl.style.opacity = '0'; charEl.style.transform = 'translateX(0)'; charEl.textContent = '';
    labelEl.style.display = round === 1 ? '' : 'none';
    charEl.style.display = round >= 2 ? '' : 'none';

    function setCandidate(cand) {
        photoHolder.innerHTML = '';
        photoHolder.appendChild(createCandidatePhoto({ name: cand.name, photo: cand.photo }));
        nameEl.textContent = cand.name || '';
    }

    showScreen('roundIntro');

    let t = 0;
    const at = (fn) => { introTimeouts.push(setTimeout(fn, t)); };

    // Category header fades in and stays for the whole sequence.
    at(() => introFadeTo(categoryEl, 1, 300));
    t += 300;

    if (round === 1) {
        // First Impression: walk the 3 candidates, each photo+name flying in then off.
        cands.forEach((cand, i) => {
            if (i === 0) {
                at(() => { labelEl.textContent = 'Candidate #1'; introPlaceOff(labelEl, off); });
                t += 1000;
                at(() => introSlideIn(labelEl));
                t += 700;
            } else {
                t += 1000;
                at(() => { labelEl.textContent = 'Candidate #' + (i + 1); introFadeTo(labelEl, 1, 500); });
                t += 500;
            }
            t += 1000;
            at(() => { setCandidate(cand); introPlaceOff(cardEl, off); introSlideIn(cardEl); });
            t += 700;
            t += 4000; // hold
            at(() => { introFadeTo(labelEl, 0, 500); introSlideOffLeft(cardEl, off); });
            t += 600;
            at(() => { cardEl.style.opacity = '0'; });
        });
    } else {
        // Rounds 2-6: fade each candidate in, then fly that round's new characteristic in.
        cands.forEach((cand, i) => {
            if (i === 0) {
                at(() => { setCandidate(cand); charEl.style.opacity = '0'; cardEl.style.transform = 'translateX(0)'; introFadeTo(cardEl, 1, 1000); });
                t += 1000;
            } else {
                at(() => { introFadeTo(charEl, 0, 1000); introFadeTo(cardEl, 0, 1000); });
                t += 1000;
                at(() => { setCandidate(cand); charEl.style.opacity = '0'; charEl.style.transform = 'translateX(0)'; introFadeTo(cardEl, 1, 1000); });
                t += 1000;
            }
            t += 1000;
            at(() => { charEl.textContent = (cand.characteristics && cand.characteristics.length) ? cand.characteristics[cand.characteristics.length - 1] : ''; introPlaceOff(charEl, off); introSlideIn(charEl); });
            t += 700;
            t += 3000; // hold
        });
    }

    // Fade everything out, then hand off to the candidate board for the answer phase.
    at(() => {
        introFadeTo(categoryEl, 0, 500);
        introFadeTo(labelEl, 0, 500);
        introFadeTo(cardEl, 0, 500);
        introFadeTo(charEl, 0, 500);
    });
    t += 600;
    at(() => { clearIntroTimeouts(); showBoardAnswering(); });
}

/**
 * Build a candidate photo element. Photos live in a `candidates/` folder, named by the pack's
 * `photo` field. The app now ships downsized .webp, but the receiver keeps the full-size .jpg
 * originals for the big screen — so we always request the .jpg regardless of the extension the
 * message carries. Falls back to a neon initial if the photo isn't on the receiver.
 */
function createCandidatePhoto(candidate) {
    const initialDiv = () => {
        const div = document.createElement('div');
        div.className = 'candidate-photo initial';
        div.textContent = (candidate.name || '?').charAt(0).toUpperCase();
        return div;
    };

    if (!candidate.photo) return initialDiv();

    const jpgName = candidate.photo.replace(/\.[a-z0-9]+$/i, '.jpg');
    const img = document.createElement('img');
    img.className = 'candidate-photo';
    img.alt = candidate.name || '';
    img.src = 'candidates/' + jpgName;
    // Gracefully fall back to the neon initial if the photo isn't on the receiver.
    img.onerror = () => { img.replaceWith(initialDiv()); };
    return img;
}

// Track round results state for reordering animation
let roundResultsReorderTimeout = null;

/**
 * Update round results screen with reordering animation
 * Shows players sorted by round score first, then animates to total score order
 */
function updateRoundResultsScreen(data) {
    const screen = screens.roundResults;

    // Clear any pending reorder timeout from previous round
    if (roundResultsReorderTimeout) {
        clearTimeout(roundResultsReorderTimeout);
        roundResultsReorderTimeout = null;
    }

    screen.querySelector('.round-number').textContent = data.roundNumber;

    const leaderboard = screen.querySelector('.leaderboard');
    leaderboard.innerHTML = '';

    // Use two-column layout for 5+ players, compact for 6+
    leaderboard.classList.toggle('two-column', data.players.length >= 5);
    leaderboard.classList.toggle('compact', data.players.length >= 6);

    // Sort players by round score (descending), then total score, then alphabetical for initial display
    const sortedByRound = [...data.players].sort((a, b) => {
        if (b.roundScore !== a.roundScore) return b.roundScore - a.roundScore;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.name.localeCompare(b.name);
    });

    // Assign initial ranks based on round score
    let roundRank = 1;
    sortedByRound.forEach((player, index) => {
        if (index > 0 && sortedByRound[index - 1].roundScore > player.roundScore) {
            roundRank = index + 1;
        }
        player.displayRank = roundRank;
        player.rank = roundRank; // Override host-sent total rank so initial display shows round ranking
    });

    // Sort by total score, then round score, then alphabetical for final rankings
    const sortedByTotal = [...data.players].sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.roundScore !== a.roundScore) return b.roundScore - a.roundScore;
        return a.name.localeCompare(b.name);
    });

    // Assign final ranks based on total score
    let totalRank = 1;
    sortedByTotal.forEach((player, index) => {
        if (index > 0 && sortedByTotal[index - 1].totalScore > player.totalScore) {
            totalRank = index + 1;
        }
        player.finalRank = totalRank;
    });

    // Create a map of player name to their final position index in the sorted-by-total array
    const finalPositions = new Map();
    sortedByTotal.forEach((player, index) => {
        finalPositions.set(player.name, index);
    });

    // Initially show players sorted by round score
    sortedByRound.forEach((player, index) => {
        const entry = createLeaderboardEntry(player, true, false);

        // Find this player's final position
        const finalIndex = finalPositions.get(player.name);
        const finalRank = sortedByTotal[finalIndex].finalRank;

        // Store animation data
        entry.setAttribute('data-initial-index', index);
        entry.setAttribute('data-final-index', finalIndex);
        entry.setAttribute('data-final-rank', finalRank);
        entry.setAttribute('data-total-score', player.totalScore);

        leaderboard.appendChild(entry);
    });

    setTwoColumnHeight(leaderboard, data.players.length);

    // Align scores header with leaderboard entries
    const scoresHeaderContainer = screen.querySelector('.scores-header-container');
    if (data.players.length >= 5) {
        // In two-column mode, match header to actual leaderboard entry position
        requestAnimationFrame(() => {
            const firstEntry = leaderboard.querySelector('.leaderboard-entry');
            if (firstEntry) {
                const leaderboardRect = leaderboard.getBoundingClientRect();
                const entryRect = firstEntry.getBoundingClientRect();
                const leftOffset = entryRect.left - leaderboardRect.left;
                scoresHeaderContainer.style.maxWidth = '100%';
                scoresHeaderContainer.style.width = '100%';
                scoresHeaderContainer.style.paddingLeft = leftOffset + 'px';
            }
        });
    } else {
        scoresHeaderContainer.style.maxWidth = '';
        scoresHeaderContainer.style.width = '';
        scoresHeaderContainer.style.paddingLeft = '';
    }

    console.log('Round results: initial order by round score, will animate in 3s');

    // Reset the scores header for initial display
    if (scoresHeaderContainer) {
        scoresHeaderContainer.classList.remove('transitioned');
    }

    const isTwoColumn = data.players.length >= 5;
    const isFinalRound = data.roundNumber >= data.totalRounds;

    // After 3 seconds, animate to final positions sorted by total score
    // Skip transition on final round — the Game Results screen shows cumulative standings
    if (isFinalRound) {
        console.log('Final round: skipping reorder animation');
    }
    if (!isFinalRound) roundResultsReorderTimeout = setTimeout(() => {
        console.log('Starting reorder animation');

        // Start crossfade: fade out "Round Scores" immediately
        if (scoresHeaderContainer) {
            scoresHeaderContainer.classList.add('transitioned');
        }

        const entries = Array.from(leaderboard.querySelectorAll('.leaderboard-entry'));
        if (entries.length === 0) {
            console.log('No entries found for animation');
            return;
        }

        // Update rank displays and crossfade scores for all entries
        entries.forEach((entry) => {
            const finalRank = entry.getAttribute('data-final-rank');

            // Update the rank display
            const rankEl = entry.querySelector('.rank');
            if (rankEl) {
                rankEl.textContent = '#' + finalRank;
                entry.className = entry.className.replace(/rank-\d+/g, '');
                entry.classList.add('rank-' + finalRank);
            }

            // Crossfade: fade out round score, fade in total score
            const roundScoreEl = entry.querySelector('.round-score');
            if (roundScoreEl) {
                roundScoreEl.style.opacity = '0';
            }
            const totalScoreReplace = entry.querySelector('.total-score-replace');
            if (totalScoreReplace) {
                totalScoreReplace.style.opacity = '1';
            }
        });

        if (isTwoColumn) {
            // Two-column layout: fade out, reorder DOM, fade back in
            // (translateY doesn't work with flex-wrap)
            leaderboard.style.transition = 'opacity 1s ease-in-out';
            leaderboard.style.opacity = '0';

            setTimeout(() => {
                const sortedEntries = entries.slice().sort((a, b) => {
                    return parseInt(a.getAttribute('data-final-index')) - parseInt(b.getAttribute('data-final-index'));
                });

                sortedEntries.forEach(entry => {
                    leaderboard.appendChild(entry);
                });

                leaderboard.style.opacity = '1';
            }, 1000);
        } else {
            // Single-column layout: use translateY animation
            const firstEntry = entries[0];
            const secondEntry = entries[1];
            let entryHeight = 75; // default

            if (firstEntry && secondEntry) {
                const firstRect = firstEntry.getBoundingClientRect();
                const secondRect = secondEntry.getBoundingClientRect();
                entryHeight = secondRect.top - firstRect.top;
            } else if (firstEntry) {
                entryHeight = firstEntry.offsetHeight + 15; // estimate gap
            }

            console.log('Entry height calculated:', entryHeight);

            entries.forEach((entry, i) => {
                const initialIndex = parseInt(entry.getAttribute('data-initial-index'));
                const finalIndex = parseInt(entry.getAttribute('data-final-index'));
                const moveDistance = (finalIndex - initialIndex) * entryHeight;

                console.log(`Player ${i}: initial=${initialIndex}, final=${finalIndex}, move=${moveDistance}px`);

                entry.style.transition = 'transform 1s ease-in-out';
                entry.style.transform = `translateY(${moveDistance}px)`;
            });

            // After animation completes, reorder DOM elements to fix spacing
            setTimeout(() => {
                console.log('Animation complete, reordering DOM');

                const sortedEntries = entries.slice().sort((a, b) => {
                    return parseInt(a.getAttribute('data-final-index')) - parseInt(b.getAttribute('data-final-index'));
                });

                sortedEntries.forEach(entry => {
                    entry.style.transition = 'none';
                    entry.style.transform = 'none';
                    leaderboard.appendChild(entry);
                });
            }, 850);
        }

    }, 3000);
}

/**
 * Update game results screen
 */
function updateGameResultsScreen(data) {
    const screen = screens.gameResults;

    // Top rank gets the WINNER badge, bottom rank gets the LOSER badge
    const topRank = Math.min(...data.players.map(p => p.rank));
    const bottomRank = Math.max(...data.players.map(p => p.rank));

    const leaderboard = screen.querySelector('.leaderboard');
    leaderboard.innerHTML = '';

    // Use two-column layout for 5+ players, compact for 6+
    leaderboard.classList.toggle('two-column', data.players.length >= 5);
    leaderboard.classList.toggle('compact', data.players.length >= 6);

    data.players.forEach(player => {
        // Determine badge: winner for top rank, loser for bottom rank
        let badge = null;
        if (player.rank === topRank) badge = 'winner';
        else if (player.rank === bottomRank) badge = 'loser';

        const entry = createGameResultEntry(player, badge);
        entry.classList.add('reveal');
        entry.setAttribute('data-rank', player.rank);
        leaderboard.appendChild(entry);
    });

    setTwoColumnHeight(leaderboard, data.players.length);

    // Staggered reveal: fade in rank groups one at a time
    const distinctRanks = [...new Set(data.players.map(p => p.rank))].sort((a, b) => a - b);
    let delay = 2000; // Initial delay before first reveal
    distinctRanks.forEach((rank, index) => {
        setTimeout(() => {
            leaderboard.querySelectorAll(`.reveal[data-rank="${rank}"]`).forEach(el => {
                el.classList.add('visible');
            });
        }, delay);
        if (index < distinctRanks.length - 1) {
            delay += 1500; // Gap between rank groups
        }
    });
}

/**
 * Create a game result entry with an optional winner/loser badge
 */
function createGameResultEntry(player, badge) {
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry rank-' + player.rank;
    entry.setAttribute('data-player-id', player.peerId || player.name);

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = '#' + player.rank;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.appendChild(createIconImg(player.iconId));

    const info = document.createElement('div');
    info.className = 'player-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'name-badge-row';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = player.name;
    nameRow.appendChild(name);

    if (badge) {
        const badgeImg = document.createElement('img');
        badgeImg.className = 'result-badge';
        badgeImg.src = badge === 'winner' ? 'dealbreaker_winner.png' : 'dealbreaker_loser.png';
        badgeImg.alt = badge === 'winner' ? 'Winner' : 'Loser';
        nameRow.appendChild(badgeImg);
    }

    info.appendChild(nameRow);

    const scoreSection = document.createElement('div');
    scoreSection.className = 'score-section';

    const totalScore = document.createElement('div');
    totalScore.className = 'total-score highlighted';
    const points = player.totalScore === 1 ? 'Pt' : 'Pts';
    totalScore.textContent = player.totalScore + ' ' + points;
    scoreSection.appendChild(totalScore);

    entry.appendChild(rank);
    entry.appendChild(icon);
    entry.appendChild(info);
    entry.appendChild(scoreSection);

    return entry;
}

// ── Lobby/Results Background Music ──────────────────────────────────

let musicFadeInterval = null;
let musicFadeInInterval = null;

function startLobbyMusic(fadeInDurationMs) {
    const audio = document.getElementById('game-audio');
    if (!audio) return;

    // Clear any ongoing fades
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
    }
    if (musicFadeInInterval) {
        clearInterval(musicFadeInInterval);
        musicFadeInInterval = null;
    }

    // Restore lobby music src if element was used for SFX
    if (!audio.src.includes('lobby_music')) {
        audio.src = 'lobby_music.m4a';
        audio.loop = true;
        audio.load();
    }

    var maxVolume = 0.8;
    audio.currentTime = 0;
    audio.volume = 0;
    audio.play().then(() => {
        console.log('Lobby music started, fading in over ' + fadeInDurationMs + 'ms');

        // Load SFX after music is playing and stable (5s delay)
        setTimeout(initSfx, 5000);

        // Fade in
        if (fadeInDurationMs && fadeInDurationMs > 0) {
            var steps = 30;
            var stepDelay = fadeInDurationMs / steps;
            var volumeStep = maxVolume / steps;
            var currentStep = 0;

            musicFadeInInterval = setInterval(function() {
                currentStep++;
                var newVolume = Math.min(maxVolume, audio.volume + volumeStep);
                audio.volume = newVolume;
                if (currentStep >= steps || newVolume >= maxVolume) {
                    clearInterval(musicFadeInInterval);
                    musicFadeInInterval = null;
                    audio.volume = maxVolume;
                }
            }, stepDelay);
        } else {
            audio.volume = maxVolume;
        }
    }).catch(e => {
        console.warn('Lobby music play failed:', e.message);
    });
}

function fadeStopLobbyMusic(fadeDurationMs) {
    const audio = document.getElementById('game-audio');
    if (!audio || audio.paused) return;

    // Clear any in-progress fade-in
    if (musicFadeInInterval) {
        clearInterval(musicFadeInInterval);
        musicFadeInInterval = null;
    }

    // Clear any previous fade-out
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
    }

    const steps = 30;
    const stepDelay = fadeDurationMs / steps;
    const volumeStep = audio.volume / steps;
    let currentStep = 0;

    console.log('Lobby music fading out over ' + fadeDurationMs + 'ms');

    musicFadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = Math.max(0, audio.volume - volumeStep);
        audio.volume = newVolume;

        if (currentStep >= steps || newVolume <= 0) {
            clearInterval(musicFadeInterval);
            musicFadeInterval = null;
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0.8;
            console.log('Lobby music fade complete, stopped');
        }
    }, stepDelay);
}

// ── Sound Effects ────────────────────────────────────────────────────
//
// Chromecast only outputs audio from a single <audio> element. SFX reuse
// the same game-audio element (lobby music is always stopped before SFX).
// Files are pre-fetched as blobs for instant playback.

var sfxBlobUrls = {};
var sfxInitStarted = false;
var lastSfxStopTime = 0;

function initSfx() {
    if (sfxInitStarted) return;
    sfxInitStarted = true;
    console.log('SFX: loading sound effects...');

    // Load sequentially to avoid network contention that causes lobby music stutter
    var files = [['countdown_bell', 'countdown_bell.m4a'], ['bell', 'bell_ding.m4a']];
    var loadNext = function(i) {
        if (i >= files.length) {
            console.log('SFX: all sound effects loaded');
            return;
        }
        var name = files[i][0], url = files[i][1];
        fetch(url)
            .then(function(r) { return r.blob(); })
            .then(function(blob) {
                sfxBlobUrls[name] = URL.createObjectURL(blob);
                console.log('SFX loaded: ' + name + ' (' + blob.size + ' bytes)');
                loadNext(i + 1);
            })
            .catch(function(e) {
                console.warn('SFX load failed ' + name + ':', e.message);
                loadNext(i + 1);
            });
    };
    loadNext(0);
}

function doPlaySfx(name, rate) {
    var blobUrl = sfxBlobUrls[name];
    var audio = document.getElementById('game-audio');
    if (!audio || !blobUrl) {
        console.warn('SFX not ready: ' + name + ' audio=' + !!audio + ' blob=' + !!blobUrl);
        return;
    }

    // Pause current audio first so Chromecast can cleanly swap src
    if (!audio.paused) {
        audio.pause();
    }

    // Reuse the single audio element — swap src and play
    audio.loop = false;
    audio.src = blobUrl;
    audio.playbackRate = rate || 1.0;
    audio.volume = 0.8;
    audio.load();
    audio.play().then(function() {
        console.log('SFX played: ' + name);
    }).catch(function(e) {
        console.warn('SFX play failed ' + name + ': ' + e.message);
    });
}

function playSfx(name, rate) {
    // If audio was just stopped (e.g. early complete), give the element time to settle
    // before swapping src, otherwise the Chromecast may silently fail
    var timeSinceStop = Date.now() - lastSfxStopTime;
    if (timeSinceStop < 150) {
        setTimeout(function() { doPlaySfx(name, rate); }, 150 - timeSinceStop);
    } else {
        doPlaySfx(name, rate);
    }
}

function stopSfx() {
    var audio = document.getElementById('game-audio');
    if (!audio || audio.paused) return;
    // Only stop if currently playing a SFX (not lobby music)
    if (!audio.src.includes('lobby_music')) {
        audio.pause();
        audio.currentTime = 0;
        lastSfxStopTime = Date.now();
        console.log('SFX stopped');
    }
}

function stopLobbyMusic() {
    const audio = document.getElementById('game-audio');
    if (!audio) return;

    // Clear any ongoing fades
    if (musicFadeInInterval) {
        clearInterval(musicFadeInInterval);
        musicFadeInInterval = null;
    }
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.8;
    console.log('Lobby music stopped immediately');
}

/**
 * Initialize the Cast Receiver
 */
function initReceiver() {
    console.log('Initializing Deal/Breaker Cast Receiver');

    const context = cast.framework.CastReceiverContext.getInstance();
    const options = new cast.framework.CastReceiverOptions();

    // Disable default media playback UI
    options.disableIdleTimeout = true;

    // Set up custom message listener
    context.addCustomMessageListener(DEALBREAKER_NAMESPACE, (event) => {
        console.log('Custom message received:', event);
        if (event.data) {
            handleMessage(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
        }
    });

    // Handle sender connected — notify sender that receiver is ready for messages
    context.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, (event) => {
        console.log('Sender connected:', event);
        // Reset to connecting screen to clear any stale state from a previous session
        showScreen('connecting');
        // Send ready acknowledgment so sender knows receiver is listening
        context.sendCustomMessage(DEALBREAKER_NAMESPACE, event.senderId, JSON.stringify({ type: 'receiver_ready' }));
        console.log('Sent receiver_ready to sender:', event.senderId);
    });

    // Handle sender disconnected
    context.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, (event) => {
        console.log('Sender disconnected:', event);
        // If no more senders, show end screen and stop any playing music
        if (context.getSenders().length === 0) {
            showScreen('end');
            setTimeout(() => stopLobbyMusic(), 2000);
        }
    });

    // Start the receiver
    context.start(options);

    // SFX loading is deferred until after lobby music starts playing
    // to avoid network activity causing audio stutter on Chromecast

    console.log('Cast Receiver started');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReceiver);
} else {
    initReceiver();
}
