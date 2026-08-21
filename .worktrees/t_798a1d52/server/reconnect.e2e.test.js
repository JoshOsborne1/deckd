/**
 * Reconnect E2E — proves the relay's grace/reclaim behaviour:
 *  1. Host creates a room, guest joins.
 *  2. Guest socket drops (simulated network loss). Server holds the seat.
 *  3. Guest reconnects with the SAME clientId + room code -> reclaims seat.
 *  4. Host socket drops. Server holds the room (host grace).
 *  5. Host reconnects with the SAME clientId + room code -> reclaims room.
 *
 * Self-contained: spawns server/index.js on a test port, then shuts it down.
 * Run: node server/reconnect.e2e.test.js
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8099;
const URL = `ws://127.0.0.1:${PORT}`;

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitFor(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

let exitCode = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) exitCode = 1;
}

async function main() {
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  // Wait for the server to accept connections.
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // --- Host creates room ---
    const host = await open();
    send(host, { type: 'create_room', clientId: 'host-1', nickname: 'Alice' });
    const created = await waitFor(host, (m) => m.type === 'room_created');
    const roomCode = created.roomCode;
    check('host created room', typeof roomCode === 'string' && roomCode.length === 6);

    // --- Guest joins ---
    const guest = await open();
    send(guest, { type: 'join_room', roomCode, clientId: 'guest-1', nickname: 'Bob' });
    await waitFor(guest, (m) => m.type === 'room_joined');
    check('guest joined', true);

    // --- Guest drops (simulated network loss) ---
    guest.terminate();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // --- Guest reconnects with same clientId -> seat reclaimed ---
    const guest2 = await open();
    send(guest2, { type: 'join_room', roomCode, clientId: 'guest-1', nickname: 'Bob' });
    const rejoined = await waitFor(guest2, (m) => m.type === 'room_joined');
    check('guest reclaimed seat on reconnect', rejoined.players.some((p) => p.clientId === 'guest-1'));

    // --- Host drops (simulated network loss) ---
    host.terminate();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // --- Host reconnects with same clientId + roomCode -> room reclaimed ---
    const host2 = await open();
    send(host2, { type: 'create_room', clientId: 'host-1', nickname: 'Alice', roomCode });
    const reclaimed = await waitFor(host2, (m) => m.type === 'room_created');
    check('host reclaimed room on reconnect', reclaimed.roomCode === roomCode);

    // --- Room still functional: guest2 still in the room ---
    const stillThere = await waitFor(guest2, (m) => m.type === 'player_joined');
    check('reconnected host re-announced to guests', stillThere.player.clientId === 'host-1');

    guest2.close();
    host2.close();
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    exitCode = 1;
  } finally {
    server.kill();
    process.exit(exitCode);
  }
}

main();
