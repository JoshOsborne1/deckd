/**
 * Deckd relay server — host-authoritative WebSocket lobby relay.
 *
 * Production requires MASTER_TOKEN_SECRET plus a server-issued host grant.
 * ALLOW_UNAUTHENTICATED_HOSTS=true is deliberately an explicit local-test
 * escape hatch and must never be set on the public relay.
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const PROTOCOL_VERSION = 1;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PLAYERS_PER_ROOM = 8;
const HOST_GRACE_MS = 30 * 1000;
const SEAT_GRACE_MS = 60 * 1000;
const MAX_PAYLOAD = 256 * 1024;
const RATE_CAPACITY = 30;
const RATE_WINDOW_MS = 5 * 1000;
const MAX_JOIN_FAILURES = 10;
const SNAPSHOT_WINDOW_MS = 10 * 1000;
const ALLOW_UNAUTHENTICATED_HOSTS = process.env.ALLOW_UNAUTHENTICATED_HOSTS === 'true';
const MASTER_TOKEN_SECRET = process.env.MASTER_TOKEN_SECRET || '';

/** @type {Map<string, {code: string, host: object|null, hostClientId: string|null, hostResumeToken: string, clients: Map<string, object>, disconnected: Map<string, object>, createdAt: number, lastActivity: number, hostGraceUntil: number|null}>} */
const rooms = new Map();

function makeRoomCode() {
  const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function makeResumeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function send(ws, msg) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify({ version: PROTOCOL_VERSION, ...msg }));
  }
}

function sendError(ws, code, message, close = false) {
  send(ws, { type: 'error', code, message, serverVersion: PROTOCOL_VERSION });
  if (close) ws.close(1008, code);
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
  for (const ws of room.clients.values()) ws.room = null;
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
    for (const [clientId, ghost] of room.disconnected) {
      if (now > ghost.expiresAt) room.disconnected.delete(clientId);
    }
    if (room.clients.size === 0 && room.disconnected.size === 0 && room.host === null) {
      rooms.delete(room.code);
    }
  }
}

function consumeRate(ws) {
  const now = Date.now();
  const elapsed = now - ws.rate.at;
  ws.rate.tokens = Math.min(RATE_CAPACITY, ws.rate.tokens + (elapsed * RATE_CAPACITY) / RATE_WINDOW_MS);
  ws.rate.at = now;
  if (ws.rate.tokens < 1) return false;
  ws.rate.tokens -= 1;
  return true;
}

function safeMasterToken(token, clientId) {
  if (!MASTER_TOKEN_SECRET) return ALLOW_UNAUTHENTICATED_HOSTS;
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = crypto.createHmac('sha256', MASTER_TOKEN_SECRET).update(clientId).digest();
  const supplied = Buffer.from(token, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function validClientMessage(msg) {
  if (!msg || typeof msg !== 'object' || msg.version !== PROTOCOL_VERSION || typeof msg.type !== 'string') return false;
  if (msg.type === 'create_room') {
    return typeof msg.clientId === 'string' && msg.clientId.length > 0 && msg.clientId.length <= 128
      && typeof msg.nickname === 'string' && msg.nickname.length <= 24
      && (msg.masterToken === undefined || typeof msg.masterToken === 'string')
      && (msg.roomCode === undefined || typeof msg.roomCode === 'string')
      && (msg.resumeToken === undefined || typeof msg.resumeToken === 'string');
  }
  if (msg.type === 'join_room') {
    return typeof msg.roomCode === 'string' && msg.roomCode.length <= 12
      && typeof msg.clientId === 'string' && msg.clientId.length > 0 && msg.clientId.length <= 128
      && typeof msg.nickname === 'string' && msg.nickname.length <= 24;
  }
  if (msg.type === 'leave_room' || msg.type === 'ping') return true;
  if (msg.type === 'relay') {
    return typeof msg.to === 'string' && msg.to.length > 0 && msg.to.length <= 128
      && typeof msg.payload === 'string' && Buffer.byteLength(msg.payload, 'utf8') <= MAX_PAYLOAD;
  }
  return false;
}

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD });

wss.on('connection', (ws) => {
  ws.clientId = null;
  ws.nickname = 'Guest';
  ws.isHost = false;
  ws.joinedAt = 0;
  ws.room = null;
  ws.rate = { tokens: RATE_CAPACITY, at: Date.now() };
  ws.joinFailures = 0;
  ws.lastSnapshotAt = 0;

  ws.on('message', (data) => {
    if (!consumeRate(ws)) {
      sendError(ws, 'rate_limited', 'Too many messages', true);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendError(ws, 'bad_json', 'Invalid JSON');
      return;
    }
    if (!validClientMessage(msg)) {
      sendError(ws, 'version_mismatch', 'Unsupported protocol version or invalid message', true);
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        if (ws.room) {
          sendError(ws, 'already_in_room', 'Leave your current room first');
          return;
        }
        if (!MASTER_TOKEN_SECRET && !ALLOW_UNAUTHENTICATED_HOSTS) {
          sendError(ws, 'host_auth_unavailable', 'Host authorization is not configured');
          return;
        }
        if (!safeMasterToken(msg.masterToken, msg.clientId)) {
          sendError(ws, 'master_required', 'A Deckd Master pass is required to host');
          return;
        }

        if (msg.roomCode) {
          const existing = rooms.get(String(msg.roomCode).toUpperCase());
          const reclaimAllowed = existing
            && existing.host === null
            && existing.hostGraceUntil
            && Date.now() < existing.hostGraceUntil
            && msg.clientId === existing.hostClientId
            && typeof msg.resumeToken === 'string'
            && msg.resumeToken === existing.hostResumeToken;
          if (reclaimAllowed) {
            existing.host = ws;
            existing.hostGraceUntil = null;
            existing.hostResumeToken = makeResumeToken(); // rotate, single-use
            existing.lastActivity = Date.now();
            ws.clientId = msg.clientId;
            ws.nickname = (msg.nickname || 'Host').slice(0, 24);
            ws.isHost = true;
            ws.joinedAt = Date.now();
            ws.room = existing;
            if (existing.clients.has(ws.clientId)) {
              sendError(ws, 'client_in_use', 'Client identity already connected');
              ws.room = null;
              existing.host = null;
              existing.hostGraceUntil = Date.now() + HOST_GRACE_MS;
              return;
            }
            existing.clients.set(ws.clientId, ws);
            send(ws, { type: 'room_created', roomCode: existing.code, role: 'host', players: roomPlayers(existing), resumeToken: existing.hostResumeToken });
            broadcast(existing, { type: 'player_joined', player: playerInfo(ws) }, ws);
            return;
          }
          // A known grace room must not be reclaimable by room code alone.
          if (existing && existing.host === null && existing.hostGraceUntil && Date.now() < existing.hostGraceUntil) {
            sendError(ws, 'host_resume_required', 'A valid host resume token is required');
            return;
          }
          if (existing) {
            sendError(ws, 'room_code_in_use', 'That room code is already active');
            return;
          }
        }

        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();
        const room = {
          code,
          host: ws,
          hostClientId: msg.clientId,
          hostResumeToken: makeResumeToken(),
          clients: new Map(),
          disconnected: new Map(),
          createdAt: Date.now(),
          lastActivity: Date.now(),
          hostGraceUntil: null,
        };
        ws.clientId = msg.clientId;
        ws.nickname = (msg.nickname || 'Host').slice(0, 24);
        ws.isHost = true;
        ws.joinedAt = Date.now();
        ws.room = room;
        room.clients.set(ws.clientId, ws);
        rooms.set(code, room);
        send(ws, { type: 'room_created', roomCode: code, role: 'host', players: roomPlayers(room), resumeToken: room.hostResumeToken });
        break;
      }

      case 'join_room': {
        if (ws.room) {
          sendError(ws, 'already_in_room', 'Leave your current room first');
          return;
        }
        const code = String(msg.roomCode || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ws.joinFailures += 1;
          sendError(ws, 'room_not_found', 'Room not found. Check the code.', ws.joinFailures >= MAX_JOIN_FAILURES);
          return;
        }
        ws.joinFailures = 0;
        if (room.disconnected.has(msg.clientId)) {
          const ghost = room.disconnected.get(msg.clientId);
          room.disconnected.delete(msg.clientId);
          if (room.clients.has(msg.clientId)) {
            sendError(ws, 'client_in_use', 'Client identity already connected');
            return;
          }
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
          sendError(ws, 'room_full', 'Room is full');
          return;
        }
        ws.clientId = msg.clientId;
        if (room.clients.has(ws.clientId)) {
          sendError(ws, 'client_in_use', 'Client identity already connected');
          ws.clientId = null;
          return;
        }
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
        if (room.clients.get(ws.clientId) === ws) room.clients.delete(ws.clientId);
        room.lastActivity = Date.now();
        broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
        if (ws.isHost) closeRoom(room);
        else if (room.clients.size === 0 && room.host === null) rooms.delete(room.code);
        ws.room = null;
        break;
      }

      case 'relay': {
        const room = ws.room;
        if (!room) {
          sendError(ws, 'not_in_room', 'Join a room first');
          return;
        }
        if (msg.to === 'host') {
          let payload;
          try { payload = JSON.parse(msg.payload); } catch { sendError(ws, 'bad_relay_payload', 'Relay payload must be JSON'); return; }
          if (payload && payload.intent === 'request_snapshot') {
            const now = Date.now();
            if (now - ws.lastSnapshotAt < SNAPSHOT_WINDOW_MS) {
              sendError(ws, 'snapshot_rate_limited', 'Snapshot requests are rate limited');
              return;
            }
            ws.lastSnapshotAt = now;
          }
          if (room.host && room.host !== ws) send(room.host, { type: 'relay', from: ws.clientId, payload: msg.payload });
        } else if (msg.to === 'all') {
          broadcast(room, { type: 'relay', from: ws.clientId, payload: msg.payload }, ws);
        } else {
          const target = room.clients.get(msg.to);
          if (target && target !== ws) send(target, { type: 'relay', from: ws.clientId, payload: msg.payload });
        }
        // Relay-only traffic does not keep an idle room alive indefinitely.
        break;
      }

      case 'ping':
        send(ws, { type: 'pong' });
        break;

      default:
        sendError(ws, 'unknown_type', `Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.lastActivity = Date.now();
    if (ws.isHost) {
      room.host = null;
      room.hostGraceUntil = Date.now() + HOST_GRACE_MS;
      if (room.clients.get(ws.clientId) === ws) room.clients.delete(ws.clientId);
      broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current && current.host === null && current.hostGraceUntil && Date.now() >= current.hostGraceUntil) closeRoom(current);
      }, HOST_GRACE_MS + 1000).unref();
    } else {
      if (room.clients.get(ws.clientId) === ws) room.clients.delete(ws.clientId);
      room.disconnected.set(ws.clientId, {
        nickname: ws.nickname,
        joinedAt: ws.joinedAt,
        expiresAt: Date.now() + SEAT_GRACE_MS,
      });
      broadcast(room, { type: 'player_left', clientId: ws.clientId, nickname: ws.nickname }, ws);
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current && current.disconnected.has(ws.clientId)) current.disconnected.delete(ws.clientId);
        if (current && current.clients.size === 0 && current.disconnected.size === 0 && current.host === null) rooms.delete(current.code);
      }, SEAT_GRACE_MS + 1000).unref();
    }
    ws.room = null;
  });
});

setInterval(sweepExpiredRooms, 60 * 1000).unref();
console.log(`[deckd-relay] listening on :${PORT}`);
