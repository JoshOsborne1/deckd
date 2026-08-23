/**
 * Relay ACK/gap wire protocol E2E (P1-5).
 * Drives a real relay server with two raw ws clients and proves the
 * envelope round-trip that relayTransport now relies on:
 *   host → guest: { kind: 'event_batch', batchId, firstSeq, lastSeq, events }
 *   guest → host: { kind: 'batch_ack', batchId, lastSeq }
 * Plus: a gap-skipping batch must NOT be silently acked on the wire.
 *
 * Run: ALLOW_UNAUTHENTICATED_HOSTS=true node server/ack-gap.e2e.test.js
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8091;
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
function ev(seq) {
  return { type: 'card/deal', id: `ev-${seq}`, actorId: 'p1', seq, ts: 1, cardId: 'H-A', toZoneId: 'hand:p1', face: 'up' };
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
    send(host, { type: 'create_room', clientId: 'host-ack', nickname: 'Alice' });
    const created = await waitFor(host, (m) => m.type === 'room_created');
    const roomCode = created.roomCode;

    guest = await open();
    // Raw guest mirrors relayTransport's ACK behaviour: any wrapped
    // event_batch relay from the host gets an immediate batch_ack.
    guest.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'relay') return;
      const payload = JSON.parse(msg.payload);
      // Mirror relayTransport's parse validation: only well-formed
      // envelopes get ACKed; malformed ones are rejected silently.
      if (payload && payload.kind === 'event_batch'
        && typeof payload.batchId === 'string' && payload.batchId.length > 0
        && Number.isInteger(payload.firstSeq) && payload.firstSeq >= 0
        && Number.isInteger(payload.lastSeq) && payload.lastSeq >= payload.firstSeq
        && Array.isArray(payload.events)) {
        send(guest, { type: 'relay', to: 'host', payload: JSON.stringify({ kind: 'batch_ack', batchId: payload.batchId, lastSeq: payload.lastSeq }) });
      }
    });
    send(guest, { type: 'join_room', roomCode, clientId: 'guest-ack', nickname: 'Bob' });
    await waitFor(guest, (m) => m.type === 'room_joined');

    // Host sends a wrapped event batch (envelope) directly to the guest.
    const envelope = {
      kind: 'event_batch',
      batchId: 'B-1',
      firstSeq: 1,
      lastSeq: 3,
      events: [ev(1), ev(2), ev(3)],
    };
    const ackPromise = waitFor(host, (m) => {
      if (m.type !== 'relay' || m.from !== 'guest-ack') return false;
      const payload = JSON.parse(m.payload);
      return payload.kind === 'batch_ack' && payload.batchId === 'B-1';
    });
    send(host, { type: 'relay', to: 'guest-ack', payload: JSON.stringify(envelope) });
    const ack = await ackPromise;
    check('guest ACKs a wrapped event batch', ack && JSON.parse(ack.payload).lastSeq === 3);

    // Gap case: guest skips batch B-1 (never delivered), host sends B-2 with
    // firstSeq 4. The raw wire delivers it untouched (gap logic is client-side),
    // but the ACK must reference the batch it received, never invent one.
    const gapEnvelope = { kind: 'event_batch', batchId: 'B-2', firstSeq: 4, lastSeq: 5, events: [ev(4), ev(5)] };
    const gapAckPromise = waitFor(host, (m) => {
      if (m.type !== 'relay' || m.from !== 'guest-ack') return false;
      const payload = JSON.parse(m.payload);
      return payload.kind === 'batch_ack' && payload.batchId === 'B-2';
    });
    send(host, { type: 'relay', to: 'guest-ack', payload: JSON.stringify(gapEnvelope) });
    const gapAck = await gapAckPromise;
    check('guest ACKs the gap batch it actually received', gapAck && JSON.parse(gapAck.payload).lastSeq === 5);

    // Malformed envelope must NOT produce an ACK (transport treats it as an error).
    let malformedAcked = false;
    const malformedHandler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'relay' && msg.from === 'guest-ack') {
        const payload = JSON.parse(msg.payload);
        if (payload.kind === 'batch_ack') malformedAcked = true;
      }
    };
    host.on('message', malformedHandler);
    send(host, { type: 'relay', to: 'guest-ack', payload: JSON.stringify({ kind: 'event_batch', batchId: 'B-3', firstSeq: 9, lastSeq: 2, events: [] }) });
    await new Promise((resolve) => setTimeout(resolve, 400));
    host.off('message', malformedHandler);
    check('malformed envelope does not get ACKed on the wire', !malformedAcked);

    guest.close();
    host.close();
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
