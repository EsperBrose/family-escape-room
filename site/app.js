// Family Escape Room: rooms, lobby, reconnecting and host controls (Milestone 1.3).
// The room creator's device is the host. It owns the room (players, lock, phase)
// and sends it to every guest. Devices find each other through the free PeerJS broker.

const MAX_PLAYERS = 20;
const MIN_PLAYERS = 2;
const PEER_PREFIX = 'esperbrose-family-escape-';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (look like 1 and 0)
const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐵', '🐧', '🐯', '🐶', '🐱', '🦖'];
const CONNECT_TIMEOUT_MS = 20000;
const CONNECT_RETRY_MS = 7000;       // first WebRTC attempt sometimes stalls; try again
// Closed tabs and sleeping phones often don't close WebRTC connections, so
// every device pings every few seconds and silent ones are marked away.
const HEARTBEAT_MS = 3000;
const SILENCE_LIMIT_MS = 10000;
const REMOVE_AWAY_AFTER_MS = 90000;  // host drops players who stay away this long
const RECONNECT_EVERY_MS = 3000;
const GIVE_UP_RECONNECT_MS = 90000;  // guest stops trying to get back in

const $ = (id) => document.getElementById(id);

const state = {
  me: { name: '', avatar: AVATARS[0] },
  playerId: '',       // stable per browser tab, so a reconnecting player keeps their spot
  pending: null,      // 'create' | { join: 'ABCD' }
  peer: null,
  isHost: false,
  code: '',
  room: { players: [], locked: false, phase: 'lobby' }, // players: [{ id, name, avatar, host, online }]
  guests: new Map(),  // host only: playerId -> { conn, lastSeen, awaySince }
  hostConn: null,     // guest only
  hostLastSeen: 0,    // guest only
  inRoom: false,      // guest only: the host has accepted us at least once
  reconnecting: 0,    // guest only: when reconnecting started (0 = connected)
  heartbeat: null,
};

// ---------- helpers ----------

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function setBusy(message, canLeave = false) {
  $('busy').hidden = !message;
  $('busy-leave').hidden = !canLeave;
  if (message) $('busy-msg').textContent = message;
}

function show(screen) {
  const target = $('screen-' + screen);
  if (target.classList.contains('active')) return;
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  window.scrollTo(0, 0);
}

function randomId(length, letters = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  let out = '';
  for (let i = 0; i < length; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';
}

function cleanAvatar(avatar) {
  return AVATARS.includes(avatar) ? avatar : AVATARS[0];
}

function readStore(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function writeStore(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

function loadProfile() {
  const saved = readStore(localStorage, 'fer-profile') || {};
  if (saved.name) state.me.name = cleanName(saved.name);
  if (saved.avatar) state.me.avatar = cleanAvatar(saved.avatar);
  state.playerId = readStore(sessionStorage, 'fer-player-id') || randomId(12);
  writeStore(sessionStorage, 'fer-player-id', state.playerId);
}

// Remembered for this tab so a reload (or the phone killing the tab) can rejoin.
function saveSession() {
  writeStore(sessionStorage, 'fer-session', {
    code: state.code,
    isHost: state.isHost,
    me: state.me,
    room: state.isHost ? state.room : null,
  });
}

// ---------- home ----------

$('create-btn').addEventListener('click', () => {
  state.pending = 'create';
  openProfile('Create a room');
});

const codeInput = $('room-code');
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (codeInput.value.length !== 4) {
    showToast('Room codes have 4 letters');
    return;
  }
  state.pending = { join: codeInput.value };
  openProfile('Join room ' + codeInput.value);
});

document.querySelectorAll('[data-go]').forEach((el) =>
  el.addEventListener('click', () => show(el.dataset.go)));

// ---------- profile ----------

function renderAvatars() {
  const grid = $('avatar-grid');
  grid.innerHTML = '';
  AVATARS.forEach((avatar) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar';
    btn.textContent = avatar;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(avatar === state.me.avatar));
    btn.addEventListener('click', () => {
      state.me.avatar = avatar;
      renderAvatars();
    });
    grid.appendChild(btn);
  });
}

function openProfile(title) {
  $('profile-title').textContent = title;
  $('player-name').value = state.me.name;
  renderAvatars();
  show('profile');
  $('player-name').focus();
}

$('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state.me.name = cleanName($('player-name').value);
  writeStore(localStorage, 'fer-profile', state.me);
  if (state.pending === 'create') createRoom();
  else if (state.pending && state.pending.join) joinRoom(state.pending.join);
});

// ---------- host ----------

// restore: room saved in this tab before a reload, reopened under the same code.
function createRoom(restore = null, attempt = 1) {
  setBusy(restore ? 'Reopening your room…' : 'Creating your room…');
  const code = restore ? restore.code : randomId(4, CODE_LETTERS);
  const peer = new Peer(PEER_PREFIX + code);
  let opened = false;

  peer.on('open', () => {
    if (opened) return; // fires again after a broker reconnect
    opened = true;
    state.peer = peer;
    state.isHost = true;
    state.code = code;
    const me = { id: state.playerId, name: state.me.name, avatar: state.me.avatar, host: true, online: true };
    if (restore && restore.room) {
      state.room = restore.room;
      state.room.players = state.room.players.map((p) =>
        p.host ? me : { ...p, online: false });
      state.room.players.forEach((p) => {
        if (!p.host) state.guests.set(p.id, { conn: null, lastSeen: 0, awaySince: Date.now() });
      });
    } else {
      state.room = { players: [me], locked: false, phase: 'lobby' };
    }
    setBusy(null);
    state.heartbeat = setInterval(hostHeartbeat, HEARTBEAT_MS);
    broadcastRoom();
  });

  peer.on('connection', (conn) => handleGuest(conn));

  peer.on('error', (err) => {
    if (opened) return; // handled by 'disconnected' / heartbeat
    peer.destroy();
    if (err.type === 'unavailable-id' && restore && attempt < 10) {
      // The broker may still be holding our code from before the reload.
      setTimeout(() => createRoom(restore, attempt + 1), 3000);
    } else if (err.type === 'unavailable-id' && !restore && attempt < 5) {
      createRoom(null, attempt + 1); // code taken by another room, pick another
    } else {
      setBusy(null);
      saveSessionCleared();
      show('home');
      showToast("Couldn't create a room. Check your internet and try again.");
    }
  });

  // Lost the broker (Wi-Fi blip, phone slept). Players already connected stay
  // connected, but reconnecting players can't find us until we're back.
  peer.on('disconnected', () => {
    setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
  });
}

function handleGuest(conn) {
  let playerId = null;

  conn.on('data', (msg) => {
    if (!msg) return;
    if (playerId) {
      const guest = state.guests.get(playerId);
      if (guest && guest.conn === conn) guest.lastSeen = Date.now();
    }
    if (msg.type === 'hello') welcomeGuest(conn, msg, (id) => { playerId = id; });
    else if (msg.type === 'bye' && playerId && state.guests.get(playerId)?.conn === conn) {
      removePlayer(playerId, ' left');
    }
  });

  const lost = () => {
    const guest = playerId && state.guests.get(playerId);
    if (!guest || guest.conn !== conn) return;
    markAway(playerId);
  };
  conn.on('close', lost);
  conn.on('error', lost);
}

function welcomeGuest(conn, msg, setId) {
  const id = /^[a-z0-9]{6,24}$/.test(msg.playerId) ? msg.playerId : conn.peer;
  const existing = state.room.players.find((p) => p.id === id);
  const reject = (reason) => {
    conn.send({ type: 'rejected', reason });
    setTimeout(() => conn.close(), 500);
  };

  if (!existing) {
    if (state.room.locked) return reject('This room is locked.');
    if (state.room.phase !== 'lobby') return reject('This game has already started.');
    if (state.room.players.length >= MAX_PLAYERS) return reject('This room is full (20 players).');
  }
  if (existing && existing.host) return reject('That player is already the host.');

  setId(id);
  const old = state.guests.get(id);
  if (old && old.conn && old.conn !== conn) old.conn.close();
  state.guests.set(id, { conn, lastSeen: Date.now(), awaySince: 0 });

  const player = { id, name: cleanName(msg.name), avatar: cleanAvatar(msg.avatar), host: false, online: true };
  if (existing) {
    Object.assign(existing, player);
    showToast(player.name + ' is back!');
  } else {
    state.room.players.push(player);
    showToast(player.name + ' joined!');
  }
  broadcastRoom();
}

function markAway(id) {
  const guest = state.guests.get(id);
  const player = state.room.players.find((p) => p.id === id);
  if (!guest || !player || !player.online) return;
  if (guest.conn) guest.conn.close();
  guest.conn = null;
  guest.awaySince = Date.now();
  player.online = false;
  broadcastRoom();
}

function removePlayer(id, notice) {
  const guest = state.guests.get(id);
  const player = state.room.players.find((p) => p.id === id);
  if (guest && guest.conn && guest.conn.open) {
    guest.conn.send({ type: 'kicked' });
    const conn = guest.conn;
    setTimeout(() => conn.close(), 500);
  }
  state.guests.delete(id);
  state.room.players = state.room.players.filter((p) => p.id !== id);
  broadcastRoom();
  if (player && notice) showToast(player.name + notice);
}

function hostHeartbeat() {
  const now = Date.now();
  state.guests.forEach((guest, id) => {
    if (guest.conn) {
      if (now - guest.lastSeen > SILENCE_LIMIT_MS) markAway(id);
      else if (guest.conn.open) guest.conn.send({ type: 'ping' });
    } else if (now - guest.awaySince > REMOVE_AWAY_AFTER_MS) {
      removePlayer(id, ' left');
    }
  });
  if (state.peer && state.peer.disconnected && !state.peer.destroyed) state.peer.reconnect();
}

function broadcastRoom() {
  const msg = { type: 'room', code: state.code, room: state.room };
  state.guests.forEach(({ conn }) => { if (conn && conn.open) conn.send(msg); });
  saveSession();
  renderRoom();
}

function closeRoomForEveryone() {
  state.guests.forEach(({ conn }) => { if (conn && conn.open) conn.send({ type: 'closed' }); });
}

$('start-btn').addEventListener('click', () => {
  if (onlinePlayers() < MIN_PLAYERS) return;
  state.room.phase = 'playing';
  broadcastRoom();
});

$('back-lobby-btn').addEventListener('click', () => {
  state.room.phase = 'lobby';
  broadcastRoom();
});

$('lock-btn').addEventListener('click', () => {
  state.room.locked = !state.room.locked;
  broadcastRoom();
  showToast(state.room.locked ? 'Room locked. No one new can join.' : 'Room unlocked.');
});

// ---------- guest ----------

function joinRoom(code, rejoining = false) {
  state.code = code;
  state.isHost = false;
  state.inRoom = false;
  if (rejoining) startReconnect();
  else {
    setBusy('Joining room ' + code + '…');
    setTimeout(() => {
      const stalled = !state.inRoom && state.code === code && state.peer && state.peer.open &&
        !(state.hostConn && state.hostConn.open);
      if (stalled) connectToHost();
    }, CONNECT_RETRY_MS);
    setTimeout(() => {
      if (!state.inRoom && !state.reconnecting && state.code === code) {
        leaveRoom("Couldn't find room " + code + '. Check the code and try again.');
      }
    }, CONNECT_TIMEOUT_MS);
  }
  makeGuestPeer();
}

function makeGuestPeer() {
  const peer = new Peer();
  state.peer = peer;
  peer.on('open', () => { if (state.peer === peer) connectToHost(); });
  peer.on('disconnected', () => {
    setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
  });
  peer.on('error', (err) => {
    if (state.peer !== peer) return;
    if (state.inRoom || state.reconnecting) return; // the reconnect loop keeps trying
    if (err.type === 'peer-unavailable') {
      leaveRoom("Couldn't find room " + state.code + '. Check the code and try again.');
    } else {
      leaveRoom("Couldn't connect. Check your internet and try again.");
    }
  });
}

function connectToHost() {
  if (state.hostConn) state.hostConn.close();
  const conn = state.peer.connect(PEER_PREFIX + state.code, { reliable: true });
  state.hostConn = conn;

  conn.on('open', () => {
    conn.send({ type: 'hello', playerId: state.playerId, name: state.me.name, avatar: state.me.avatar });
  });

  conn.on('data', (msg) => {
    if (!msg || state.hostConn !== conn) return;
    state.hostLastSeen = Date.now();
    if (msg.type === 'rejected') leaveRoom(msg.reason);
    else if (msg.type === 'kicked') leaveRoom('The host removed you from the room.');
    else if (msg.type === 'closed') leaveRoom('The host closed the room.');
    else if (msg.type === 'room') {
      const firstTime = !state.inRoom;
      state.inRoom = true;
      if (state.reconnecting) {
        state.reconnecting = 0;
        showToast('Reconnected! 🎉');
      }
      setBusy(null);
      if (firstTime && !state.heartbeat) state.heartbeat = setInterval(guestHeartbeat, HEARTBEAT_MS);
      state.room = sanitizeRoom(msg.room);
      saveSession();
      renderRoom();
    }
  });

  conn.on('close', () => {
    if (state.hostConn === conn && state.inRoom) startReconnect();
  });
}

function sanitizeRoom(room) {
  const players = Array.isArray(room && room.players) ? room.players.slice(0, MAX_PLAYERS) : [];
  return {
    players: players.map((p) => ({
      id: String(p.id), name: cleanName(p.name), avatar: cleanAvatar(p.avatar), host: !!p.host, online: p.online !== false,
    })),
    locked: !!(room && room.locked),
    phase: room && room.phase === 'playing' ? 'playing' : 'lobby',
  };
}

function startReconnect() {
  if (state.reconnecting) return;
  state.reconnecting = Date.now();
  setBusy('Reconnecting to room ' + state.code + '… 📶', true);
  if (!state.heartbeat) state.heartbeat = setInterval(guestHeartbeat, HEARTBEAT_MS);
}

function guestHeartbeat() {
  const now = Date.now();
  if (state.reconnecting) {
    if (now - state.reconnecting > GIVE_UP_RECONNECT_MS) {
      leaveRoom("Couldn't reconnect to the room.");
      return;
    }
    if (now - (state.lastRetry || 0) < RECONNECT_EVERY_MS) return;
    state.lastRetry = now;
    if (!state.peer || state.peer.destroyed) makeGuestPeer();
    else if (state.peer.disconnected) state.peer.reconnect(); // 'open' then reconnects to host
    else if (state.peer.open) connectToHost();
    return;
  }
  if (now - state.hostLastSeen > SILENCE_LIMIT_MS) startReconnect();
  else if (state.hostConn && state.hostConn.open) state.hostConn.send({ type: 'ping' });
}

// ---------- room screens ----------

function onlinePlayers() {
  return state.room.players.filter((p) => p.online).length;
}

function renderRoom() {
  const room = state.room;
  history.replaceState(null, '', '?room=' + state.code);
  $('lobby-code').textContent = state.code;
  $('game-code').textContent = state.code;
  $('game-count').textContent = room.players.length;
  $('host-controls').hidden = !state.isHost;
  $('waiting-msg').hidden = state.isHost;
  $('locked-msg').hidden = state.isHost || !room.locked;
  $('back-lobby-btn').hidden = !state.isHost;

  const canStart = onlinePlayers() >= MIN_PLAYERS;
  $('start-btn').disabled = !canStart;
  $('start-hint').hidden = canStart;
  $('lock-btn').textContent = room.locked ? '🔒 Room is locked (tap to unlock)' : '🔓 Room is open (tap to lock)';

  const list = $('player-list');
  list.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'player' + (p.online ? '' : ' offline');
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = cleanAvatar(p.avatar);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = cleanName(p.name);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = [
      p.host ? '👑 host' : '',
      p.id === state.playerId ? '(you)' : '',
      p.online ? '' : '📶 reconnecting…',
    ].filter(Boolean).join(' ');
    li.append(face, name, tag);
    if (state.isHost && !p.host) {
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'kick';
      kick.textContent = '✖';
      kick.setAttribute('aria-label', 'Remove ' + cleanName(p.name));
      kick.addEventListener('click', () => {
        if (confirm('Remove ' + cleanName(p.name) + ' from the room?')) removePlayer(p.id, ' was removed');
      });
      li.appendChild(kick);
    }
    list.appendChild(li);
  });
  $('player-count').textContent = room.players.length + '/' + MAX_PLAYERS;

  show(room.phase === 'playing' ? 'game' : 'lobby');
}

function inviteLink() {
  return location.origin + location.pathname + '?room=' + state.code;
}

$('share-btn').addEventListener('click', async () => {
  const text = 'Join our Family Escape Room! Code: ' + state.code;
  if (navigator.share) {
    try { await navigator.share({ title: 'Family Escape Room', text, url: inviteLink() }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text + ' ' + inviteLink());
    showToast('Invite link copied!');
  } catch {
    showToast('Share this code: ' + state.code);
  }
});

// ---------- leaving ----------

function saveSessionCleared() {
  writeStore(sessionStorage, 'fer-session', null);
}

function leaveRoom(message) {
  clearInterval(state.heartbeat);
  if (state.isHost) closeRoomForEveryone();
  else if (state.hostConn && state.hostConn.open) state.hostConn.send({ type: 'bye' });
  const peer = state.peer;
  // Give the goodbye message a moment to send before tearing down.
  if (peer) setTimeout(() => peer.destroy(), 500);
  Object.assign(state, {
    peer: null, isHost: false, code: '', hostConn: null, heartbeat: null, pending: null,
    inRoom: false, reconnecting: 0, hostLastSeen: 0,
    room: { players: [], locked: false, phase: 'lobby' },
  });
  state.guests = new Map();
  saveSessionCleared();
  setBusy(null);
  history.replaceState(null, '', location.pathname);
  show('home');
  if (message) showToast(message);
}

document.querySelectorAll('.leave-btn').forEach((btn) => btn.addEventListener('click', () => {
  const msg = state.isHost ? 'Leave and close the room for everyone?' : 'Leave this room?';
  if (confirm(msg)) leaveRoom();
}));

$('busy-leave').addEventListener('click', () => leaveRoom());

// Phones pause pages in the background; check the connection as soon as we're back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.code) return;
  if (state.isHost) hostHeartbeat();
  else if (state.inRoom) guestHeartbeat();
});

// Free the room code right away on reload/close so the host can reopen it.
window.addEventListener('pagehide', () => { if (state.peer) state.peer.destroy(); });
// Safari may restore a page from memory with its connections gone; reload to rejoin.
window.addEventListener('pageshow', (event) => { if (event.persisted && state.code) location.reload(); });

// ---------- start ----------

loadProfile();
const session = readStore(sessionStorage, 'fer-session');
const linkCode = new URLSearchParams(location.search).get('room');

if (session && session.code && /^[A-Z]{4}$/.test(session.code)) {
  // This tab was in a room before a reload: go straight back in as the same player.
  if (session.me) state.me = { name: cleanName(session.me.name), avatar: cleanAvatar(session.me.avatar) };
  if (session.isHost) createRoom({ code: session.code, room: session.room });
  else joinRoom(session.code, true);
} else if (linkCode && /^[A-Za-z]{4}$/.test(linkCode)) {
  codeInput.value = linkCode.toUpperCase();
  state.pending = { join: codeInput.value };
  openProfile('Join room ' + codeInput.value);
}
