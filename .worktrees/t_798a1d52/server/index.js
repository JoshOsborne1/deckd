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
const HOST_GRACE_MS = 30 * 1000; // host may reclaim the room for 30s after a drop
const SEAT_GRACE_MS = 60 * 1000; // guest seat is held for 60s after a drop

/** @type {Map<string, {code: string, host: object|null, clients: Map<string, object>, disconnected: Map<string, object>, createdAt: number, lastActivity: number, hostGraceUntil: number|null}>} */
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
  room.disconnected.clear();
  rooms.delete(room.code);
}

function sweepExpiredRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      closeRoom(room);
      continue;
    }
    // Expire held seats whose grace window has passed.
    for (const [clientId, ghost] of room.disconnected) {
      if (now > ghost.expiresAt) {
        room.disconnected.delete(clientId);
      }
    }
    // A room with no live clients, no held seats, and no host is dead.
    if (room.clients.size === 0 && room.disconnected.size === 0 && room.host === null) {
      rooms.delete(room.code);
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
        // Reconnect: a dropped host reclaims the room within the grace window.
        if (msg.roomCode) {
          const existing = rooms.get(msg.roomCode);
          if (existing && existing.hostGraceUntil && Date.now() < existing.hostGraceUntil) {
            existing.host = ws;
            existing.hostGraceUntil = null;
            existing.lastActivity = Date.now();
            ws.clientId = msg.clientId || existing.host?.clientId || `c-${crypto.randomBytes(4).toString('hex')}`;
            ws.nickname = (msg.nickname || 'Host').slice(0, 24);
            ws.isHost = true;
            ws.joinedAt = Date.now();
            ws.room = existing;
            existing.clients.set(ws.clientId, ws);
            send(ws, { type: 'room_created', roomCode: existing.code, role: 'host', players: roomPlayers(existing) });
            broadcast(existing, { type: 'player_joined', player: playerInfo(ws) }, ws);
            return;
          }
        }
        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();
        const room = {
          code,
          host: ws,
          clients: new Map(),
          disconnected: new Map(),
          createdAt: Date.now(),
          lastActivity: Date.now(),
          hostGraceUntil: null,
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
        // Reconnect: a dropped guest reclaims their seat within the grace window.
        if (room.disconnected.has(msg.clientId)) {
          const ghost = room.disconnected.get(msg.clientId);
          room.disconnected.delete(msg.clientId);
          room.clients.set(msg.clientId, ws);
          room.lastActivity = Date.now();
          ws.clientId = msg.clientId;
          ws.nickname = (msg.nickname || ghost.nickname || 'Guest').slice(0, 24);
          ws.isHost = false;
          ws.joinedAt = ghost.joinedAt || Date.now();
          ws.room = room;
          send(ws, { type: 'room_joined', roomCode: code, role: 'guest', players: roomPlayers(room) });
          broadcast(room, { type: 'player_joined', player: playerInfo(ws) }, ws);
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
        } else if (msg.to === 'all') {
          broadcast(room, { type: 'relay', from: ws.clientId, payload: String(msg.payload || '') }, ws);
        } else {
          // Direct-addressed relay: send only to the named client.
          const target = room.clients.get(msg.to);
          if (target && target !== ws) {
            send(target, { type: 'relay', from: ws.clientId, payload: String(msg.payload || '') });
          }
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
    room.lastActivity = Date.now();
    if (ws.isHost) {
      // Host dropped: hold the room for the grace window so a reconnect
      // can reclaim it. After the window, close the room.
      room.host = null;
      room.hostGraceUntil = Date.now() + HOST_GRACE_MS;
      room.clients.delete(ws.clientId);
      broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current && current.host === null && current.hostGraceUntil && Date.now() >= current.hostGraceUntil) {
          closeRoom(current);
        }
      }, HOST_GRACE_MS + 1000).unref();
    } else {
      room.clients.delete(ws.clientId);
      // Hold the seat briefly so a dropped guest can reclaim it.
      room.disconnected.set(ws.clientId, {
        nickname: ws.nickname,
        joinedAt: ws.joinedAt,
        expiresAt: Date.now() + SEAT_GRACE_MS,
      });
      broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current && current.disconnected.has(ws.clientId)) {
          current.disconnected.delete(ws.clientId);
        }
        if (current && current.clients.size === 0 && current.disconnected.size === 0 && current.host === null) {
          rooms.delete(room.code);
        }
      }, SEAT_GRACE_MS + 1000).unref();
    }
    ws.room = null;
  });
});

setInterval(sweepExpiredRooms, 60 * 1000).unref();

console.log(`[deckd-relay] listening on :${PORT}`);
