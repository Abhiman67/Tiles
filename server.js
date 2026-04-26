const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;
const TOTAL_TILES = GRID_WIDTH * GRID_HEIGHT;

const tiles = Array.from({ length: TOTAL_TILES }, (_, index) => ({
  index,
  ownerId: null,
  ownerName: null,
  ownerColor: null,
  claimedAt: null,
}));

const users = new Map();
const connections = new Map();
let guestCounter = 1;

app.use(express.static(path.join(__dirname, 'public')));

function colorFromString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 72% 58%)`;
}

function normalizeName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  return clean.slice(0, 20) || `Guest ${guestCounter++}`;
}

function makeClientId(value) {
  const clean = String(value || '').trim();
  if (clean) {
    return clean.slice(0, 64);
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function publicUser(user) {
  return {
    clientId: user.clientId,
    name: user.name,
    color: user.color,
    connected: user.connected,
  };
}

function publicTile(tile) {
  return {
    index: tile.index,
    ownerId: tile.ownerId,
    ownerName: tile.ownerName,
    ownerColor: tile.ownerColor,
    claimedAt: tile.claimedAt,
  };
}

function boardStats() {
  const claimed = tiles.reduce((count, tile) => count + (tile.ownerId ? 1 : 0), 0);
  const connectedUsers = [...users.values()].filter((user) => user.connected).length;
  return {
    totalTiles: TOTAL_TILES,
    claimedTiles: claimed,
    openTiles: TOTAL_TILES - claimed,
    connectedUsers,
  };
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function syncUsersList() {
  broadcast({
    type: 'users-update',
    users: [...users.values()].map(publicUser),
    stats: boardStats(),
  });
}

function syncTile(index) {
  broadcast({
    type: 'tile-update',
    tile: publicTile(tiles[index]),
    stats: boardStats(),
  });
}

wss.on('connection', (socket) => {
  let activeClientId = null;

  send(socket, {
    type: 'connected',
    grid: {
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      totalTiles: TOTAL_TILES,
    },
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      send(socket, { type: 'error', message: 'Invalid message format.' });
      return;
    }

    if (message.type === 'hello') {
      const clientId = makeClientId(message.clientId);
      const name = normalizeName(message.name);
      const color = colorFromString(clientId);
      let user = users.get(clientId);

      if (!user) {
        user = {
          clientId,
          name,
          color,
          connected: true,
        };
        users.set(clientId, user);
      } else {
        user.name = name;
        user.color = color;
        user.connected = true;
      }

      activeClientId = clientId;
      connections.set(socket, clientId);

      send(socket, {
        type: 'welcome',
        user: publicUser(user),
        tiles: tiles.map(publicTile),
        users: [...users.values()].map(publicUser),
        stats: boardStats(),
      });
      syncUsersList();
      return;
    }

    if (message.type === 'claim-tile') {
      const clientId = activeClientId || connections.get(socket);
      const user = clientId ? users.get(clientId) : null;
      const index = Number(message.index);

      if (!user || !Number.isInteger(index) || index < 0 || index >= TOTAL_TILES) {
        send(socket, { type: 'claim-rejected', index, reason: 'invalid-request' });
        return;
      }

      const tile = tiles[index];
      if (tile.ownerId && tile.ownerId !== clientId) {
        send(socket, {
          type: 'claim-rejected',
          index,
          reason: 'already-claimed',
          tile: publicTile(tile),
        });
        return;
      }

      tile.ownerId = clientId;
      tile.ownerName = user.name;
      tile.ownerColor = user.color;
      tile.claimedAt = tile.claimedAt || Date.now();

      syncTile(index);
      return;
    }

    if (message.type === 'rename') {
      const clientId = activeClientId || connections.get(socket);
      const user = clientId ? users.get(clientId) : null;
      if (!user) {
        return;
      }

      user.name = normalizeName(message.name);
      for (const tile of tiles) {
        if (tile.ownerId === clientId) {
          tile.ownerName = user.name;
        }
      }
      syncUsersList();
      broadcast({
        type: 'tile-refresh',
        tiles: tiles.map(publicTile),
      });
    }
  });

  socket.on('close', () => {
    const clientId = connections.get(socket) || activeClientId;
    if (clientId && users.has(clientId)) {
      users.get(clientId).connected = false;
      syncUsersList();
    }
    connections.delete(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tiles app running on http://localhost:${PORT}`);
});
