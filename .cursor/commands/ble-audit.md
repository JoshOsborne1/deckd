---
description: Audit BLE code for violations of the BLE safety rule. Read-only; produces a report.
---

# /ble-audit

Run a structured audit of BLE-related code. Output is a report, not a diff.

## Scope

- `lib/ble.ts` and `lib/ble.web.ts`
- Any screen importing from `@lib/ble` or `react-native-ble-plx`
- Any store under `src/store/` that touches BLE state

## Checks

1. **API parity:** `lib/ble.ts` and `lib/ble.web.ts` export identical public APIs (types + class methods + helpers). List any divergence.
2. **Peripheral honesty:** confirm the `⚠ PERIPHERAL MODE NOT IMPLEMENTED` marker is present and visible near `startHostAdvertising()`. If missing, flag.
3. **Cleanup:** every consumer that calls `getBLEService()` must also arrange `destroyBLEService()` / `disconnect()` / `stopScanning()` in a cleanup path. List any that don't.
4. **Error paths:** scan for `.catch(() => {})` or empty-arrow catches in BLE call sites. List offenders with file + line.
5. **Web isolation:** confirm no top-level `import` of `react-native-ble-plx` in files that Metro also bundles for web (anything outside `lib/ble.ts`).
6. **Permission sync:** compare `app.json -> ios.infoPlist` BLE strings against actual API usage. Flag stale permissions.
7. **Message envelope:** confirm all BLE payloads go through `GameStateMessage` (typed + timestamped + senderId). Flag bare `JSON.stringify({ ... })` payloads.

## Output format

```
API parity: OK | drift on BLEService.connectToDevice(...) signature
Peripheral honesty: marker present at lib/ble.ts:65
Cleanup: app/game/pass.tsx registers service, no cleanup in useEffect return
Error paths: 2 silent catches — lib/ble.ts:278, app/game/index.tsx:42
Web isolation: OK
Permissions: BLUETOOTH_ADVERTISE declared, never used (expected — peripheral mode unresolved)
Envelopes: OK
Recommended followups: ...
```

## Fix flow

Do not auto-fix in audit mode. If the user wants a fix, run it as a separate, scoped change after reviewing the report together.

## Reference

See `.cursor/skills/ble-realtalk/SKILL.md` and `.cursor/rules/ble-safety.mdc`.
