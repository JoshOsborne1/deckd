/**
 * Deckd relay server — dumb pipe for cloud lobbies.
 *
 * Model: host is the source of truth. Guests send intents to the host,
 * the host broadcasts event batches to all. The server only manages
 * rooms, membership, and relay.
 *
 * Run: node server/index.js  (or PM2 on the roxai stack)
 * Env: PORT (default 8080), MASTER_TOKEN_SECRET (optional, for host auth)
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms expire after 6h
const MAX_PLAYERS_PER_ROOM = 8;

/** @type {Map<string, {code: string, host: object|null, clients: Map<string, object>, createdAt: number, lastActivity: number}>} */
const rooms = new Map();

function makeRoomCode() {
  const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function send(ws, msg) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}

function playerInfo(ws) {
  return {
    clientId: ws.clientId,
    nickname: ws.nickname,
    isHost: ws.isHost,
    joinedAt: ws.joinedAt,
  };
}

function roomPlayers(room) {
  return [...room.clients.values()].map(playerInfo);
}

function broadcast(room, msg, except) {
  for (const ws of room.clients.values()) {
    if (ws !== except) send(ws, msg);
  }
}

function closeRoom(room) {
  broadcast(room, { type: 'room_closed' });
  for (const ws of room.clients.values()) {
    ws.room = null;
  }
  room.clients.clear();
  rooms.delete(room.code);
}

function sweepExpiredRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      closeRoom(room);
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.clientId = null;
  ws.nickname = 'Guest';
  ws.isHost = false;
  ws.joinedAt = 0;
  ws.room = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', code: 'bad_json', message: 'Invalid JSON' });
      return;
    }
    if (!msg || typeof msg.type !== 'string') {
      send(ws, { type: 'error', code: 'bad_message', message: 'Missing type' });
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        if (ws.room) {
          send(ws, { type: 'error', code: 'already_in_room', message: 'Leave your current room first' });
          return;
        }
        // Host auth: masterToken must match the shared secret when configured.
        if (process.env.MASTER_TOKEN_SECRET) {
          const expected = crypto
            .createHmac('sha256', process.env.MASTER_TOKEN_SECRET)
            .update(msg.clientId || '')
            .digest('hex');
          if (!msg.masterToken || msg.masterToken !== expected) {
            send(ws, { type: 'error', code: 'master_required', message: 'A Deckd Master pass is required to host' });
            return;
          }
        }
        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();
        const room = {
          code,
          host: ws,
          clients: new Map(),
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };
        ws.clientId = msg.clientId || `c-${crypto.randomBytes(4).toString('hex')}`;
        ws.nickname = (msg.nickname || 'Host').slice(0, 24);
        ws.isHost = true;
        ws.joinedAt = Date.now();
        ws.room = room;
        room.clients.set(ws.clientId, ws);
        rooms.set(code, room);
        send(ws, { type: 'room_created', roomCode: code, role: 'host', players: roomPlayers(room) });
        break;
      }

      case 'join_room': {
        if (ws.room) {
          send(ws, { type: 'error', code: 'already_in_room', message: 'Leave your current room first' });
          return;
        }
        const code = String(msg.roomCode || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'error', code: 'room_not_found', message: 'Room not found. Check the code.' });
          return;
        }
        if (room.clients.size >= MAX_PLAYERS_PER_ROOM) {
          send(ws, { type: 'error', code: 'room_full', message: 'Room is full' });
          return;
        }
        ws.clientId = msg.clientId || `c-${crypto.randomBytes(4).toString('hex')}`;
        ws.nickname = (msg.nickname || 'Guest').slice(0, 24);
        ws.isHost = false;
        ws.joinedAt = Date.now();
        ws.room = room;
        room.clients.set(ws.clientId, ws);
        room.lastActivity = Date.now();
        send(ws, { type: 'room_joined', roomCode: code, role: 'guest', players: roomPlayers(room) });
        broadcast(room, { type: 'player_joined', player: playerInfo(ws) }, ws);
        break;
      }

      case 'leave_room': {
        const room = ws.room;
        if (!room) break;
        room.clients.delete(ws.clientId);
        room.lastActivity = Date.now();
        broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
        if (ws.isHost) {
          closeRoom(room);
        } else if (room.clients.size === 0) {
          rooms.delete(room.code);
        }
        ws.room = null;
        break;
      }

      case 'relay': {
        const room = ws.room;
        if (!room) break;
        room.lastActivity = Date.now();
        if (msg.to === 'host') {
          if (room.host && room.host !== ws) {
            send(room.host, { type: 'relay', from: ws.clientId, payload: String(msg.payload || '') });
          }
        } else {
          broadcast(room, { type: 'relay', from: ws.clientId, payload: String(msg.payload || '') }, ws);
        }
        break;
      }

      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        send(ws, { type: 'error', code: 'unknown_type', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.clients.delete(ws.clientId);
    room.lastActivity = Date.now();
    broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
    if (ws.isHost) {
      closeRoom(room);
    } else if (room.clients.size === 0) {
      rooms.delete(room.code);
    }
    ws.room = null;
  });
});

setInterval(sweepExpiredRooms, 60 * 1000).unref();

console.log(`[deckd-relay] listening on :${PORT}`);
