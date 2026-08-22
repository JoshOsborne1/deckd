/**
 * End-to-end relay protocol smoke test.
 * Drives the real server (server/index.js on ws://127.0.0.1:8080) with two
 * raw ws clients acting as host + guest, exercising the same message flow the
 * lobbyStore + relayTransport will use in the app.
 *
 * Run after `node server/index.js` is up:
 *   node server/relay.e2e.test.js
 */

const WebSocket = require('ws');

const URL = `ws://127.0.0.1:${process.env.RELAY_TEST_PORT || 8080}`;

function send(ws, msg) {
  ws.send(JSON.stringify({ version: 1, ...msg }));
}

let exitCode = 0;

function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) exitCode = 1;
}

const host = new WebSocket(URL);
let hostRoomCode = null;
let hostPlayersSeen = 0;
let guestJoinBroadcast = false;
let relayToHost = false;
let relayToGuest = false;
let roomClosedSeen = false;

host.on('open', () => {
  send(host, { type: 'create_room', clientId: 'host-1', nickname: 'Alice' });
});

host.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  // console.log('HOST <-', msg.type);
  if (msg.type === 'room_created') {
    hostRoomCode = msg.roomCode;
    hostPlayersSeen = msg.players.length;
    // Now spawn the guest to join.
    const guest = new WebSocket(URL);
    guest.on('open', () => {
      send(guest, { type: 'join_room', roomCode: hostRoomCode, clientId: 'guest-1', nickname: 'Bob' });
    });
    guest.on('message', (gdata) => {
      const gmsg = JSON.parse(gdata.toString());
      // console.log('GUEST <-', gmsg.type);
      if (gmsg.type === 'room_joined') {
        check('guest room_joined players count', gmsg.players.length === 2);
        // Guest sends an intent (relay to host).
        send(guest, { type: 'relay', to: 'host', payload: JSON.stringify({ intent: 'ready', payload: {} }) });
      }
      if (gmsg.type === 'relay' && gmsg.from === 'host-1') {
        relayToGuest = true;
        const parsed = JSON.parse(gmsg.payload);
        check('host relay (event batch) reached guest', parsed.type === 'event_batch');
        // Guest leaves.
        send(guest, { type: 'leave_room' });
        guest.close();
      }
      if (gmsg.type === 'player_joined') {
        // Should not happen on guest side for itself; host gets this.
      }
    });
    guest.on('error', (e) => check('guest ws no error', false));
  }
  if (msg.type === 'player_joined') {
    guestJoinBroadcast = true;
    check('host saw player_joined (Bob)', msg.player.nickname === 'Bob');
    // Host broadcasts an event batch to all.
    send(host, { type: 'relay', to: 'all', payload: JSON.stringify({ type: 'event_batch', events: [] }) });
  }
  if (msg.type === 'relay' && msg.from === 'guest-1') {
    relayToHost = true;
    const parsed = JSON.parse(msg.payload);
    check('guest relay (intent) reached host', parsed.intent === 'ready');
  }
  if (msg.type === 'player_left') {
    check('host saw player_left (Bob)', msg.clientId === 'guest-1');
    // Host leaves -> room should close.
    send(host, { type: 'leave_room' });
    host.close();
  }
  if (msg.type === 'room_closed') {
    roomClosedSeen = true;
  }
});

host.on('error', () => check('host ws no error', false));

host.on('close', () => {
  // Final assertions.
  check('host got a 6-char room code', typeof hostRoomCode === 'string' && hostRoomCode.length === 6);
  check('host started with 1 player', hostPlayersSeen === 1);
  check('guest join broadcast reached host', guestJoinBroadcast);
  check('guest intent relayed to host', relayToHost);
  check('host event batch relayed to guest', relayToGuest);
  console.log(`\nroomCode=${hostRoomCode}`);
  process.exit(exitCode);
});

// Safety timeout.
setTimeout(() => {
  console.error('TIMEOUT — flow did not complete');
  process.exit(1);
}, 5000);