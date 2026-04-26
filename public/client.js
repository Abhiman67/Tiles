const board = document.getElementById('board');
const connectionStatus = document.getElementById('connectionStatus');
const connectedCount = document.getElementById('connectedCount');
const claimedCount = document.getElementById('claimedCount');
const openCount = document.getElementById('openCount');
const myTilesCount = document.getElementById('myTilesCount');
const activityText = document.getElementById('activityText');
const nameInput = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveNameBtn');

const state = {
  tiles: [],
  users: [],
  me: null,
  gridSize: 400,
  socketReady: false,
};

const storedClientId = localStorage.getItem('tiles-client-id') || crypto.randomUUID();
localStorage.setItem('tiles-client-id', storedClientId);

const storedName = localStorage.getItem('tiles-display-name') || `Student ${Math.floor(Math.random() * 900 + 100)}`;
nameInput.value = storedName;

const localSocketUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const socketUrl = location.hostname === 'localhost'
  ? localSocketUrl
  : 'wss://tiles-8m4p.onrender.com';
let socket = null;
let reconnectTimer = null;
let hasBuiltBoard = false;

function setStatus(online) {
  connectionStatus.textContent = online ? 'Online' : 'Offline';
  connectionStatus.className = `status-chip ${online ? 'online' : 'offline'}`;
}

function updateStats() {
  const claimed = state.tiles.filter((tile) => tile.ownerId).length;
  const mine = state.tiles.filter((tile) => tile.ownerId === state.me?.clientId).length;

  connectedCount.textContent = String(state.users.filter((user) => user.connected).length);
  claimedCount.textContent = String(claimed);
  openCount.textContent = String(state.tiles.length - claimed);
  myTilesCount.textContent = String(mine);
}

function setActivity(message) {
  activityText.textContent = message;
}

function buildBoard(size) {
  if (hasBuiltBoard) {
    return;
  }

  board.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < size; index += 1) {
    const tileButton = document.createElement('button');
    tileButton.className = 'tile open';
    tileButton.type = 'button';
    tileButton.dataset.index = String(index);
    tileButton.setAttribute('aria-label', `Tile ${index + 1}`);

    const tint = document.createElement('div');
    tint.className = 'tile-tint';

    const label = document.createElement('div');
    label.className = 'tile-label';
    label.innerHTML = `<span class="tile-index">${index + 1}</span><span class="tile-owner">Open</span>`;

    tileButton.appendChild(tint);
    tileButton.appendChild(label);
    tileButton.addEventListener('click', onTileClick);
    fragment.appendChild(tileButton);
  }

  board.appendChild(fragment);
  hasBuiltBoard = true;
}

function tileDom(index) {
  return board.querySelector(`.tile[data-index="${index}"]`);
}

function paintTile(tile) {
  const cell = tileDom(tile.index);
  if (!cell) {
    return;
  }

  const isOwned = Boolean(tile.ownerId);
  const isMine = tile.ownerId === state.me?.clientId;

  cell.classList.toggle('open', !isOwned);
  cell.classList.toggle('owned', isOwned);
  cell.classList.toggle('mine', isMine);

  const tint = cell.querySelector('.tile-tint');
  const ownerLabel = cell.querySelector('.tile-owner');
  const indexLabel = cell.querySelector('.tile-index');

  if (!isOwned) {
    tint.style.background = 'transparent';
    ownerLabel.textContent = 'Open';
    cell.style.cursor = 'pointer';
    indexLabel.textContent = String(tile.index + 1);
    return;
  }

  tint.style.background = tile.ownerColor || '#7ee0ff';
  ownerLabel.textContent = tile.ownerName || 'Taken';
  cell.style.cursor = isMine ? 'default' : 'not-allowed';
  indexLabel.textContent = isMine ? 'Yours' : 'Taken';
}

function renderBoard() {
  buildBoard(state.tiles.length || state.gridSize);
  state.tiles.forEach(paintTile);
  updateStats();
}

function onTileClick(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);
  const tile = state.tiles[index];

  if (!tile || tile.ownerId) {
    setActivity('That tile is already taken. Try another one.');
    return;
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setActivity('Not connected yet. Wait a second and try again.');
    return;
  }

  socket.send(JSON.stringify({
    type: 'claim-tile',
    index,
  }));
}

function sendHello() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({
    type: 'hello',
    clientId: storedClientId,
    name: nameInput.value.trim() || storedName,
  }));
}

function sendRename() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const nextName = nameInput.value.trim().slice(0, 20) || storedName;
  localStorage.setItem('tiles-display-name', nextName);
  socket.send(JSON.stringify({
    type: 'rename',
    name: nextName,
  }));
  setActivity(`You are now playing as ${nextName}.`);
}

function handleMessage(event) {
  const message = JSON.parse(event.data);

  if (message.type === 'connected') {
    state.gridSize = message.grid.totalTiles;
    buildBoard(message.grid.totalTiles);
    return;
  }

  if (message.type === 'welcome') {
    state.me = message.user;
    state.tiles = message.tiles;
    state.users = message.users;
    setActivity(`Welcome ${message.user.name}. Click an open tile to claim it.`);
    renderBoard();
    return;
  }

  if (message.type === 'users-update') {
    state.users = message.users;
    updateStats();
    return;
  }

  if (message.type === 'tile-update') {
    const nextTile = message.tile;
    state.tiles[nextTile.index] = nextTile;
    paintTile(nextTile);
    updateStats();

    if (nextTile.ownerId === state.me?.clientId) {
      setActivity(`You captured tile ${nextTile.index + 1}.`);
    } else {
      setActivity(`${nextTile.ownerName} captured tile ${nextTile.index + 1}.`);
    }
    return;
  }

  if (message.type === 'tile-refresh') {
    state.tiles = message.tiles;
    renderBoard();
    return;
  }

  if (message.type === 'claim-rejected') {
    setActivity('Someone got there first. Pick another tile.');
    return;
  }

  if (message.type === 'error') {
    setActivity(message.message || 'Something went wrong on the server.');
  }
}

function connect() {
  setStatus(false);
  socket = new WebSocket(socketUrl);

  socket.addEventListener('open', () => {
    state.socketReady = true;
    setStatus(true);
    sendHello();
  });

  socket.addEventListener('message', handleMessage);

  socket.addEventListener('close', () => {
    state.socketReady = false;
    setStatus(false);
    setActivity('Connection lost. Reconnecting...');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(connect, 1000);
  });

  socket.addEventListener('error', () => {
    setActivity('WebSocket error. Trying again shortly.');
  });
}

saveNameBtn.addEventListener('click', () => {
  const nextName = nameInput.value.trim().slice(0, 20) || storedName;
  nameInput.value = nextName;
  localStorage.setItem('tiles-display-name', nextName);
  sendRename();
});

nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveNameBtn.click();
  }
});

buildBoard(400);
setActivity('Connecting to the live board...');
connect();
