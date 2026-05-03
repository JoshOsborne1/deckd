---
name: ble-realtalk
description: The truth about BLE peripheral mode in Deckd. Use whenever BLE host, advertising, or multiplayer handshake code is being written or discussed. Forces honesty about what `react-native-ble-plx` can and cannot do, and lists the realistic alternatives.
---

# BLE realtalk — what actually works

## The short version

**`react-native-ble-plx` is a GATT central (client) library.** It cannot advertise services. It cannot act as a GATT peripheral. The current `BLEService.startHostAdvertising()` method in `lib/ble.ts` sets an internal state flag and returns a random name — **it does not broadcast anything**. A client scanning for that host will not find it.

Deckd's USP is "BLE-local multiplayer — no accounts, no server." That feature is **not implemented** today. Any code that assumes two devices can discover each other via this library alone is wrong.

## Why this matters for every BLE task

- When asked to "make multiplayer work", do not write more client code on top of `startHostAdvertising()` as if it functions. The missing piece is peripheral/advertising, not more client logic.
- When asked to "scan for hosts", the scan code in `startScanningForHosts()` is correct **in isolation** — but there is nothing for it to find in the current architecture.
- When asked to add a feature that requires host/peer sync, flag this constraint up front.

## Realistic options (pick one — this is a product decision)

### Option A — Build a custom Expo native module for BLE peripheral
- Pros: true on-brand "offline, no server" story. Works at a bar with no Wi-Fi.
- Cons: real native work. iOS uses `CBPeripheralManager` (well-documented); Android uses `BluetoothLeAdvertiser` + GATT server. Background advertising on iOS is heavily restricted.
- Effort: 1–2 weeks for a working prototype on both platforms. Ongoing maintenance across SDK upgrades.
- Template: Expo Modules API — `npx create-expo-module --local` inside the project.

### Option B — Pivot to **local network** via Zeroconf / Bonjour / mDNS
- Library: `react-native-zeroconf` or similar. Or UDP multicast via `react-native-udp`.
- Pros: works today, no native module. Same "local, same-network" property from a user perspective.
- Cons: requires Wi-Fi. "BLE" marketing copy must change. Some coffee-shop networks isolate clients (AP isolation) and break this.
- Effort: 2–3 days to a working prototype.

### Option C — QR-code handshake + thin cloud relay
- Host generates a short-lived room code → displays as QR. Guests scan → join a WebSocket room on a simple Node/Cloudflare Worker relay.
- Pros: most reliable on any network, cheapest to operate at scale, easiest to debug.
- Cons: introduces a server dependency — technically "not account-free" in the infrastructure sense even if user-facing is still accountless. Privacy story shifts.
- Effort: 1 week including host + guest flows + relay deployment.

### Option D — Keep `ble-plx` for **client-only device discovery** and pair it with one of B/C above
- Use BLE to exchange the room code / IP / short-lived token between phones that are physically close, then switch to WebSocket / LAN for actual gameplay.
- This is the **most pragmatic** option and preserves "just point the phones at each other" UX without requiring peripheral implementation.
- Effort: medium. The BLE part becomes one small exchange; the gameplay transport is robust.

## What to do when asked to write host-mode code

1. **Pause.** Tell the user that host mode is not implemented and cite this skill.
2. Summarize the four options above in one paragraph each.
3. Ask which direction they want to commit to before writing code. Update `STATUS.md` with the decision.
4. If forced to stub further, **only** add code that is clearly marked with the existing `⚠ PERIPHERAL MODE NOT IMPLEMENTED` comment and does not mislead future readers.

## What to do when asked "does BLE work?"

- "Partially. The central/client scanning and GATT read/write wiring is in place. Peripheral/advertising is not — `react-native-ble-plx` does not support it. We need an architectural decision before multiplayer can actually work."

## Permissions reminder

`app.json` declares the BLE permissions today even though they are only half-used. If option B/C is chosen, some of these can be removed to reduce store-review friction:

```
ios.infoPlist: NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription
android.permissions: BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE, ACCESS_FINE_LOCATION
```

If option D: keep BLE permissions but drop `BLUETOOTH_ADVERTISE` (not needed for central-only).
If option B: drop all BLE permissions; add `NSLocalNetworkUsageDescription` on iOS.
If option C: drop all BLE permissions.

## References to cite when writing code

- `react-native-ble-plx` docs — https://dotintent.github.io/react-native-ble-plx/ (central/peripheral support note).
- Expo Modules API — https://docs.expo.dev/modules/overview/ (for option A).
- `react-native-zeroconf` — https://github.com/balthazar/react-native-zeroconf (for option B).
- Apple `CBPeripheralManager` — https://developer.apple.com/documentation/corebluetooth/cbperipheralmanager.
- Android `BluetoothLeAdvertiser` — https://developer.android.com/reference/android/bluetooth/le/BluetoothLeAdvertiser.
