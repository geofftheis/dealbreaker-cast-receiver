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
    answering: document.getElementById('answering-screen'),
    reveal: document.getElementById('reveal-screen'),
    roundResults: document.getElementById('round-results-screen'),
    gameResults: document.getElementById('game-results-screen'),
    end: document.getElementById('end-screen')
};

let currentScreen = 'connecting';

/**
 * Show a specific screen and hide all others
 */
function showScreen(screenName) {
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

            case 'answering':
                updateAnsweringScreen(data);
                showScreen('answering');
                break;

            case 'reveal':
                updateRevealScreen(data);
                showScreen('reveal');
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
    screen.querySelector('.countdown-number').textContent = data.secondsRemaining;
    screen.querySelector('.total-rounds').textContent = data.totalRounds;
}

/**
 * Update answering screen — Deal/Breaker has no answer timer, so this just
 * shows how many players have locked in their picks.
 */
function updateAnsweringScreen(data) {
    const screen = screens.answering;

    screen.querySelector('.round-number').textContent = data.roundNumber;
    screen.querySelector('.answers-received').textContent = data.answersReceived;
    screen.querySelector('.total-players').textContent = data.totalPlayers;
}

/**
 * Build a candidate photo element. Photos (if present) live in a `candidates/`
 * folder named by the pack's `photo` field; until those are delivered to the
 * receiver, we fall back to a neon initial — same as the app's placeholder.
 */
function createCandidatePhoto(candidate) {
    const initialDiv = () => {
        const div = document.createElement('div');
        div.className = 'candidate-photo initial';
        div.textContent = (candidate.name || '?').charAt(0).toUpperCase();
        return div;
    };

    if (!candidate.photo) return initialDiv();

    const img = document.createElement('img');
    img.className = 'candidate-photo';
    img.alt = candidate.name || '';
    img.src = 'candidates/' + candidate.photo;
    // Gracefully fall back to the neon initial if the photo isn't on the receiver.
    img.onerror = () => { img.replaceWith(initialDiv()); };
    return img;
}

/**
 * Update reveal screen — 3 candidates across the top; the players who picked
 * each candidate drop in one-by-one, grouped by candidate, left to right.
 *
 * Expected message shape (sent by the app's CastBridge on GamePhase.REVEAL):
 *   { type: "reveal", roundNumber, totalRounds, category,
 *     candidates: [ { candidateId, name, age, photo, race } ],
 *     picks:      [ { candidateId, players: [ { name, iconId } ] } ] }
 */
function updateRevealScreen(data) {
    const screen = screens.reveal;
    const container = screen.querySelector('.reveal-candidates');
    container.innerHTML = '';

    const candidates = data.candidates || [];
    const picksByCandidate = {};
    (data.picks || []).forEach(p => { picksByCandidate[p.candidateId] = p.players || []; });

    // Reveal order: all picks, ordered candidate-by-candidate (left to right).
    const pickEls = [];

    candidates.forEach(candidate => {
        const col = document.createElement('div');
        col.className = 'reveal-candidate';

        col.appendChild(createCandidatePhoto(candidate));

        const name = document.createElement('div');
        name.className = 'candidate-name';
        name.textContent = candidate.name || '';
        col.appendChild(name);

        if (candidate.age !== undefined && candidate.age !== null) {
            const age = document.createElement('div');
            age.className = 'candidate-age';
            age.textContent = 'Age ' + candidate.age;
            col.appendChild(age);
        }

        const picksWrap = document.createElement('div');
        picksWrap.className = 'reveal-picks';

        const pickers = picksByCandidate[candidate.candidateId] || [];
        pickers.forEach(player => {
            const chip = document.createElement('div');
            chip.className = 'reveal-pick';

            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.appendChild(createIconImg(player.iconId));

            const pname = document.createElement('span');
            pname.className = 'name';
            pname.textContent = player.name;

            chip.appendChild(icon);
            chip.appendChild(pname);
            picksWrap.appendChild(chip);
            pickEls.push(chip);
        });

        col.appendChild(picksWrap);
        container.appendChild(col);
    });

    // Staggered "drop in", one name at a time, grouped left to right.
    let delay = 800;
    pickEls.forEach(el => {
        setTimeout(() => el.classList.add('visible'), delay);
        delay += 650;
    });
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

    // Top rank gets the WINNER badge
    const topRank = Math.min(...data.players.map(p => p.rank));

    const leaderboard = screen.querySelector('.leaderboard');
    leaderboard.innerHTML = '';

    // Use two-column layout for 5+ players, compact for 6+
    leaderboard.classList.toggle('two-column', data.players.length >= 5);
    leaderboard.classList.toggle('compact', data.players.length >= 6);

    data.players.forEach(player => {
        const isWinner = player.rank === topRank;
        const entry = createGameResultEntry(player, isWinner);
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
 * Create a game result entry with an optional WINNER badge
 */
function createGameResultEntry(player, isWinner) {
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

    if (isWinner) {
        const badge = document.createElement('span');
        badge.className = 'winner-badge';
        badge.textContent = 'WINNER';
        nameRow.appendChild(badge);
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
