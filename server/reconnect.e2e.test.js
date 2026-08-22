/**
 * Relay reconnect/security E2E. Run with the local-only auth escape hatch:
 *   ALLOW_UNAUTHENTICATED_HOSTS=true node server/reconnect.e2e.test.js
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8099;
const URL = `ws://127.0.0.1:${PORT}`;
const VERSION = 1;
function send(ws, msg) { ws.send(JSON.stringify({ version: VERSION, ...msg })); }
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
    env: { ...process.env, PORT: String(PORT), ALLOW_UNAUTHENTICATED_HOSTS: 'true' },
    stdio: 'ignore',
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  let host;
  let guest;
  try {
    host = await open();
    send(host, { type: 'create_room', clientId: 'host-1', nickname: 'Alice' });
    const created = await waitFor(host, (m) => m.type === 'room_created');
    const roomCode = created.roomCode;
    const resumeToken = created.resumeToken;
    check('host created room', typeof roomCode === 'string' && roomCode.length === 6);
    check('host received resume token', typeof resumeToken === 'string' && resumeToken.length === 64);

    guest = await open();
    send(guest, { type: 'join_room', roomCode, clientId: 'guest-1', nickname: 'Bob' });
    await waitFor(guest, (m) => m.type === 'room_joined');
    check('guest joined', true);
    guest.terminate();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const guest2 = await open();
    send(guest2, { type: 'join_room', roomCode, clientId: 'guest-1', nickname: 'Bob' });
    const rejoined = await waitFor(guest2, (m) => m.type === 'room_joined');
    check('guest reclaimed seat on reconnect', rejoined.players.some((p) => p.clientId === 'guest-1'));

    host.terminate();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const attacker = await open();
    send(attacker, { type: 'create_room', clientId: 'attacker', nickname: 'Eve', roomCode });
    const denied = await waitFor(attacker, (m) => m.type === 'error');
    check('room code alone cannot reclaim host', denied.code === 'host_resume_required');
    attacker.close();

    const host2 = await open();
    send(host2, { type: 'create_room', clientId: 'host-1', nickname: 'Alice', roomCode, resumeToken });
    const reclaimed = await waitFor(host2, (m) => m.type === 'room_created');
    check('host reclaimed with valid token', reclaimed.roomCode === roomCode);
    check('resume token rotated after reclaim', reclaimed.resumeToken !== resumeToken);

    const reuse = await open();
    send(reuse, { type: 'create_room', clientId: 'host-1', nickname: 'Alice', roomCode, resumeToken });
    const reuseDenied = await waitFor(reuse, (m) => m.type === 'error');
    check('resume token cannot be reused', reuseDenied.code === 'host_resume_required' || reuseDenied.code === 'client_in_use' || reuseDenied.code === 'room_code_in_use');
    reuse.close();
    guest2.close();
    host2.close();
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    exitCode = 1;
  } finally {
    host?.close();
    guest?.close();
    server.kill();
    process.exit(exitCode);
  }
}
main();
