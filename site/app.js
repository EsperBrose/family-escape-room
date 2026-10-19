// Family Escape Room: rooms + lobby (Milestone 1.2).
// The room creator's device is the host. It owns the player list and sends it
// to every guest. Devices find each other through the free PeerJS broker.

const MAX_PLAYERS = 20;
const PEER_PREFIX = 'esperbrose-family-escape-';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (look like 1 and 0)
const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐵', '🐧', '🐯', '🐶', '🐱', '🦖'];
const CONNECT_TIMEOUT_MS = 12000;
// Closed tabs and sleeping phones often don't close WebRTC connections, so
// every device pings every few seconds and silent ones are dropped.
const HEARTBEAT_MS = 3000;
const SILENCE_LIMIT_MS = 10000;

const $ = (id) => document.getElementById(id);

const state = {
  me: { name: '', avatar: AVATARS[0] },
  pending: null,      // 'create' | { join: 'ABCD' }
  peer: null,
  isHost: false,
  code: '',
  players: [],        // [{ id, name, avatar, host }]
  guests: new Map(),  // host only: peerId -> { conn, lastSeen, drop }
  hostConn: null,     // guest only
  hostLastSeen: 0,    // guest only
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

function setBusy(message) {
  $('busy').hidden = !message;
  if (message) $('busy-msg').textContent = message;
}

function show(screen) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  $('screen-' + screen).classList.add('active');
  window.scrollTo(0, 0);
}

function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';
}

function cleanAvatar(avatar) {
  return AVATARS.includes(avatar) ? avatar : AVATARS[0];
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem('fer-profile') || '{}');
    if (saved.name) state.me.name = cleanName(saved.name);
    if (saved.avatar) state.me.avatar = cleanAvatar(saved.avatar);
  } catch { /* storage unavailable */ }
}

function saveProfile() {
  try { localStorage.setItem('fer-profile', JSON.stringify(state.me)); } catch { /* ignore */ }
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
  saveProfile();
  if (state.pending === 'create') createRoom();
  else if (state.pending && state.pending.join) joinRoom(state.pending.join);
});

// ---------- host ----------

function createRoom(attempt = 1) {
  setBusy('Creating your room…');
  const code = randomCode();
  const peer = new Peer(PEER_PREFIX + code);

  peer.on('open', (id) => {
    state.peer = peer;
    state.isHost = true;
    state.code = code;
    state.players = [{ id, name: state.me.name, avatar: state.me.avatar, host: true }];
    setBusy(null);
    enterLobby();
    state.heartbeat = setInterval(hostHeartbeat, HEARTBEAT_MS);
  });

  peer.on('connection', (conn) => handleGuest(conn));

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && attempt < 5) {
      peer.destroy();
      createRoom(attempt + 1); // code already taken, try another
      return;
    }
    if (!state.peer) {
      setBusy(null);
      showToast("Couldn't create a room. Check your internet and try again.");
      peer.destroy();
    }
  });

  peer.on('disconnected', () => {
    // Lost the broker; existing players stay connected, but new ones can't join until we reconnect.
    if (!peer.destroyed) peer.reconnect();
  });
}

function handleGuest(conn) {
  const drop = () => {
    const guest = state.guests.get(conn.peer);
    if (!guest || guest.conn !== conn) return;
    state.guests.delete(conn.peer);
    conn.close();
    const leaving = state.players.find((p) => p.id === conn.peer);
    state.players = state.players.filter((p) => p.id !== conn.peer);
    broadcastLobby();
    if (leaving) showToast(leaving.name + ' left');
  };

  conn.on('data', (msg) => {
    const guest = state.guests.get(conn.peer);
    if (guest && guest.conn === conn) guest.lastSeen = Date.now();
    if (!msg || msg.type !== 'hello') return;
    if (state.players.length >= MAX_PLAYERS) {
      conn.send({ type: 'rejected', reason: 'This room is full (20 players).' });
      setTimeout(() => conn.close(), 500);
      return;
    }
    state.guests.set(conn.peer, { conn, lastSeen: Date.now(), drop });
    state.players = state.players.filter((p) => p.id !== conn.peer);
    state.players.push({ id: conn.peer, name: cleanName(msg.name), avatar: cleanAvatar(msg.avatar), host: false });
    broadcastLobby();
    showToast(cleanName(msg.name) + ' joined!');
  });

  conn.on('close', drop);
  conn.on('error', drop);
}

function hostHeartbeat() {
  const now = Date.now();
  state.guests.forEach((guest) => {
    if (now - guest.lastSeen > SILENCE_LIMIT_MS) guest.drop();
    else if (guest.conn.open) guest.conn.send({ type: 'ping' });
  });
}

function broadcastLobby() {
  const msg = { type: 'lobby', code: state.code, players: state.players };
  state.guests.forEach(({ conn }) => { if (conn.open) conn.send(msg); });
  renderLobby();
}

// ---------- guest ----------

function joinRoom(code) {
  setBusy('Joining room ' + code + '…');
  const peer = new Peer();
  let joined = false;

  const fail = (message) => {
    if (joined) return;
    setBusy(null);
    showToast(message);
    peer.destroy();
  };
  const timer = setTimeout(() => fail("Couldn't find room " + code + '. Check the code and try again.'), CONNECT_TIMEOUT_MS);

  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true });

    conn.on('open', () => {
      conn.send({ type: 'hello', name: state.me.name, avatar: state.me.avatar });
    });

    conn.on('data', (msg) => {
      if (!msg) return;
      state.hostLastSeen = Date.now();
      if (msg.type === 'rejected') {
        clearTimeout(timer);
        fail(msg.reason);
        return;
      }
      if (msg.type === 'lobby') {
        if (!joined) {
          joined = true;
          clearTimeout(timer);
          state.peer = peer;
          state.hostConn = conn;
          state.isHost = false;
          state.code = code;
          setBusy(null);
          enterLobby();
          state.heartbeat = setInterval(() => guestHeartbeat(conn), HEARTBEAT_MS);
        }
        state.players = Array.isArray(msg.players) ? msg.players : [];
        renderLobby();
      }
    });

    conn.on('close', () => {
      if (!joined || state.hostConn !== conn) return;
      resetToHome();
      showToast('The host closed the room.');
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      clearTimeout(timer);
      fail("Couldn't find room " + code + '. Check the code and try again.');
    } else if (!joined) {
      clearTimeout(timer);
      fail("Couldn't connect. Check your internet and try again.");
    }
  });
}

function guestHeartbeat(conn) {
  if (state.hostConn !== conn) return;
  if (Date.now() - state.hostLastSeen > SILENCE_LIMIT_MS) {
    resetToHome();
    showToast('Lost connection to the host.');
    return;
  }
  if (conn.open) conn.send({ type: 'ping' });
}

// ---------- lobby ----------

function enterLobby() {
  $('lobby-code').textContent = state.code;
  $('start-btn').hidden = !state.isHost;
  $('waiting-msg').hidden = state.isHost;
  history.replaceState(null, '', '?room=' + state.code);
  renderLobby();
  show('lobby');
}

function renderLobby() {
  const list = $('player-list');
  list.innerHTML = '';
  const myId = state.peer && state.peer.id;
  state.players.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'player';
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = cleanAvatar(p.avatar);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = cleanName(p.name);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = [p.host ? '👑 host' : '', p.id === myId ? '(you)' : ''].filter(Boolean).join(' ');
    li.append(face, name, tag);
    list.appendChild(li);
  });
  $('player-count').textContent = state.players.length + '/' + MAX_PLAYERS;
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

function resetToHome() {
  clearInterval(state.heartbeat);
  if (state.peer) state.peer.destroy();
  Object.assign(state, { peer: null, isHost: false, code: '', players: [], hostConn: null, heartbeat: null, pending: null });
  state.guests = new Map();
  history.replaceState(null, '', location.pathname);
  show('home');
}

$('leave-btn').addEventListener('click', () => {
  const msg = state.isHost ? 'Leave and close the room for everyone?' : 'Leave this room?';
  if (confirm(msg)) resetToHome();
});

window.addEventListener('pagehide', () => { if (state.peer) state.peer.destroy(); });

// ---------- start ----------

loadProfile();
const linkCode = new URLSearchParams(location.search).get('room');
if (linkCode && /^[A-Za-z]{4}$/.test(linkCode)) {
  codeInput.value = linkCode.toUpperCase();
  state.pending = { join: codeInput.value };
  openProfile('Join room ' + codeInput.value);
}
