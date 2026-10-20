// Game engine and screens: theme vote -> puzzles -> win/lose (Phase 2).
// The host runs the rules; guests send actions ('vote', 'answer') and draw
// whatever room state the host sends back. Uses globals from app.js.

const PHASES = ['lobby', 'vote', 'playing', 'won', 'lost'];

function themeById(id) {
  return window.THEMES.find((t) => t.id === id && t.available) || null;
}

function currentTheme() {
  return state.room.game ? themeById(state.room.game.themeId) : null;
}

// Host clock estimate, so every device shows the same countdown.
function hostNow() {
  return Date.now() + (state.isHost ? 0 : state.clockOffset || 0);
}

// Every action goes through the host, including the host's own.
function sendGame(msg) {
  if (state.isHost) hostGameMessage(state.playerId, msg);
  else if (state.hostConn && state.hostConn.open) state.hostConn.send(msg);
}

// ---------- host rules ----------

function startVote() {
  state.room.phase = 'vote';
  state.room.votes = {};
  state.room.game = null;
  broadcastRoom();
}

function startGame() {
  const tally = {};
  Object.values(state.room.votes || {}).forEach((id) => {
    if (themeById(id)) tally[id] = (tally[id] || 0) + 1;
  });
  const best = Math.max(0, ...Object.values(tally));
  const winners = Object.keys(tally).filter((id) => tally[id] === best);
  const themeId = winners.length ? winners[Math.floor(Math.random() * winners.length)] : 'practice';
  const theme = themeById(themeId);
  const now = Date.now();
  state.room.game = {
    themeId,
    startedAt: now,
    endsAt: now + theme.durationMin * 60000,
    finishedAt: 0,
    solved: [],
    event: { n: 0 },
  };
  state.room.phase = 'playing';
  broadcastRoom();
}

function playAgain() {
  state.room.phase = 'lobby';
  state.room.votes = {};
  state.room.game = null;
  broadcastRoom();
}

// Which puzzle and clues a player sees. For now everyone works on the next
// unsolved puzzle and sees every clue (clue splitting comes in Milestone 2.2).
function viewFor(playerId) {
  const theme = currentTheme();
  if (state.room.phase !== 'playing' || !theme) return null;
  const puzzle = theme.puzzles.find((p) => !state.room.game.solved.includes(p.id));
  if (!puzzle) return null;
  return { puzzleId: puzzle.id, clues: puzzle.clues.map((_, i) => i) };
}

function isCorrect(puzzle, value) {
  const answer = puzzle.answer;
  if (puzzle.input.type === 'sequence') {
    return Array.isArray(value) && value.length === answer.length && value.every((v, i) => v === answer[i]);
  }
  if (puzzle.input.type === 'code') {
    return String(value || '').toUpperCase().replace(/\s/g, '') === answer;
  }
  return value === answer;
}

function gameEvent(kind, text) {
  const game = state.room.game;
  game.event = { n: (game.event ? game.event.n : 0) + 1, kind, text };
}

function hostGameMessage(playerId, msg) {
  const room = state.room;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !msg) return;

  if (msg.type === 'vote' && room.phase === 'vote' && themeById(msg.themeId)) {
    room.votes[playerId] = msg.themeId;
    broadcastRoom();
    return;
  }

  if (msg.type === 'answer' && room.phase === 'playing') {
    const view = viewFor(playerId);
    const theme = currentTheme();
    if (!view || view.puzzleId !== msg.puzzleId) return; // stale or not their puzzle
    const puzzle = theme.puzzles.find((p) => p.id === msg.puzzleId);
    if (isCorrect(puzzle, msg.value)) {
      room.game.solved.push(puzzle.id);
      gameEvent('solved', player.name + ' opened ' + puzzle.title + '! 🎉');
      if (room.game.solved.length === theme.puzzles.length) {
        room.phase = 'won';
        room.game.finishedAt = Date.now();
      }
    } else {
      gameEvent('wrong', player.name + ' tried, but that’s not it. Keep going!');
    }
    broadcastRoom();
  }
}

// Called by the host heartbeat.
function hostGameTick() {
  const game = state.room.game;
  if (state.room.phase === 'playing' && game && Date.now() >= game.endsAt) {
    state.room.phase = 'lost';
    game.finishedAt = game.endsAt;
    broadcastRoom();
  }
}

// Guests only accept well-formed game state from the host.
function sanitizeGame(room) {
  const phase = PHASES.includes(room && room.phase) ? room.phase : 'lobby';
  const votes = {};
  if (room && room.votes && typeof room.votes === 'object') {
    Object.entries(room.votes).forEach(([pid, tid]) => { if (themeById(tid)) votes[String(pid)] = tid; });
  }
  let game = null;
  const g = room && room.game;
  if (g && themeById(g.themeId)) {
    game = {
      themeId: g.themeId,
      startedAt: Number(g.startedAt) || 0,
      endsAt: Number(g.endsAt) || 0,
      finishedAt: Number(g.finishedAt) || 0,
      solved: Array.isArray(g.solved) ? g.solved.map(String) : [],
      event: g.event && typeof g.event.n === 'number'
        ? { n: g.event.n, kind: String(g.event.kind || ''), text: String(g.event.text || '') }
        : { n: 0 },
    };
  }
  if (phase !== 'lobby' && phase !== 'vote' && !game) return { phase: 'lobby', votes, game: null };
  return { phase, votes, game };
}

function sanitizeView(view) {
  const theme = currentTheme();
  if (!view || !theme) return null;
  const puzzle = theme.puzzles.find((p) => p.id === view.puzzleId);
  if (!puzzle) return null;
  const clues = Array.isArray(view.clues)
    ? view.clues.filter((i) => Number.isInteger(i) && i >= 0 && i < puzzle.clues.length)
    : [];
  return { puzzleId: puzzle.id, clues };
}

// ---------- screens ----------

const draft = { puzzleId: null, value: null }; // the answer being built on this device
let lastEventShown = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function renderGame() {
  const phase = state.room.phase;
  if (phase === 'vote') renderVote();
  else if (phase === 'playing') renderPlay();
  else if (phase === 'won' || phase === 'lost') renderResults();

  const event = state.room.game && state.room.game.event;
  if (event && event.n > lastEventShown) {
    if (lastEventShown > 0 || event.n === 1) showToast(event.text);
    lastEventShown = event.n;
  }
  if (!state.room.game) lastEventShown = 0;
}

function renderVote() {
  const list = $('vote-list');
  list.innerHTML = '';
  const votes = state.room.votes || {};
  window.THEMES.forEach((theme) => {
    const voters = state.room.players.filter((p) => votes[p.id] === theme.id);
    const card = el('button', 'vote-card');
    card.type = 'button';
    card.disabled = !theme.available;
    if (votes[state.playerId] === theme.id) card.classList.add('mine');
    card.append(el('span', 'vote-emoji', theme.emoji), el('span', 'vote-name', theme.name));
    if (theme.available) {
      card.append(el('span', 'vote-voters', voters.map((p) => p.avatar).join(' ') || 'Tap to vote'));
      card.addEventListener('click', () => sendGame({ type: 'vote', themeId: theme.id }));
    } else {
      card.append(el('span', 'vote-voters', 'Coming soon'));
    }
    list.appendChild(card);
  });

  const online = state.room.players.filter((p) => p.online).length;
  const voted = Object.keys(votes).length;
  $('vote-status').textContent = voted + ' of ' + online + ' players voted';
  $('vote-start').hidden = !state.isHost;
  $('vote-start').disabled = voted === 0;
  $('vote-wait').hidden = state.isHost;
}

function renderPlay() {
  const theme = currentTheme();
  const game = state.room.game;
  const view = state.you;
  $('play-progress').textContent = 'Puzzle ' + Math.min(game.solved.length + 1, theme.puzzles.length) +
    ' of ' + theme.puzzles.length;
  updateTimer();
  if (!view) return;

  const puzzle = theme.puzzles.find((p) => p.id === view.puzzleId);
  const fresh = draft.puzzleId !== puzzle.id;
  if (fresh) {
    draft.puzzleId = puzzle.id;
    draft.value = puzzle.input.type === 'choice' ? null : [];
  }

  $('puzzle-emoji').textContent = puzzle.emoji;
  $('puzzle-title').textContent = puzzle.title;
  $('puzzle-prompt').textContent = puzzle.prompt;

  const clues = $('clue-list');
  clues.innerHTML = '';
  view.clues.forEach((i) => {
    const clue = puzzle.clues[i];
    const li = el('li', 'clue');
    li.append(el('span', 'clue-big', clue.big), el('span', 'clue-text', clue.text));
    clues.appendChild(li);
  });
  $('clue-empty').hidden = view.clues.length > 0;

  renderAnswer(puzzle);
}

function renderAnswer(puzzle) {
  const box = $('answer-box');
  box.innerHTML = '';
  const input = puzzle.input;

  if (input.type === 'choice') {
    const grid = el('div', 'choice-grid');
    input.options.forEach((opt) => {
      const btn = el('button', 'choice' + (draft.value === opt.id ? ' picked' : ''));
      btn.type = 'button';
      btn.append(el('span', 'choice-emoji', opt.emoji), el('span', 'choice-label', opt.label));
      btn.addEventListener('click', () => { draft.value = opt.id; renderAnswer(puzzle); });
      grid.appendChild(btn);
    });
    box.appendChild(grid);
  } else {
    const slots = el('div', 'slots');
    for (let i = 0; i < input.length; i++) {
      slots.appendChild(el('span', 'slot' + (draft.value[i] ? ' filled' : ''), draft.value[i] || ''));
    }
    box.appendChild(slots);

    let keys = input.options;
    if (input.type === 'code') {
      keys = input.keys === 'digits'
        ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    }
    const pad = el('div', 'keypad ' + (input.type === 'sequence' ? 'keypad-big' : input.keys));
    keys.forEach((key) => {
      const btn = el('button', 'key-btn', key);
      btn.type = 'button';
      btn.disabled = draft.value.length >= input.length;
      btn.addEventListener('click', () => {
        if (draft.value.length < input.length) draft.value.push(key);
        renderAnswer(puzzle);
      });
      pad.appendChild(btn);
    });
    const back = el('button', 'key-btn key-back', '⌫');
    back.type = 'button';
    back.setAttribute('aria-label', 'Delete');
    back.disabled = draft.value.length === 0;
    back.addEventListener('click', () => { draft.value.pop(); renderAnswer(puzzle); });
    pad.appendChild(back);
    box.appendChild(pad);
  }

  const ready = input.type === 'choice' ? draft.value !== null : draft.value.length === input.length;
  const submit = el('button', 'btn btn-primary', '🔓 Try it!');
  submit.type = 'button';
  submit.disabled = !ready;
  submit.addEventListener('click', () => {
    const value = input.type === 'code' ? draft.value.join('') : draft.value;
    sendGame({ type: 'answer', puzzleId: puzzle.id, value });
    draft.value = input.type === 'choice' ? null : [];
    renderAnswer(puzzle);
  });
  box.appendChild(submit);
}

function updateTimer() {
  const game = state.room.game;
  if (!game || state.room.phase !== 'playing') return;
  const left = game.endsAt - hostNow();
  const timer = $('play-timer');
  timer.textContent = '⏱️ ' + formatTime(left);
  timer.classList.toggle('urgent', left < 60000);
}
setInterval(updateTimer, 500);

function renderResults() {
  const theme = currentTheme();
  const game = state.room.game;
  const won = state.room.phase === 'won';
  $('result-emoji').textContent = won ? '🏆' : '⏰';
  $('result-title').textContent = won ? 'You escaped!' : "Time's up!";
  $('result-text').textContent = won ? theme.winText : theme.loseText;
  const stats = won
    ? 'Time left: ' + formatTime(game.endsAt - game.finishedAt)
    : 'Locks opened: ' + game.solved.length + ' of ' + theme.puzzles.length;
  $('result-stats').textContent = stats;
  $('again-btn').hidden = !state.isHost;
  $('again-wait').hidden = state.isHost;
}

$('vote-start').addEventListener('click', () => { if (state.isHost) startGame(); });
$('again-btn').addEventListener('click', () => { if (state.isHost) playAgain(); });
