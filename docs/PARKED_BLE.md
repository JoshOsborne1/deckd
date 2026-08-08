# Parked BLE track

BLE multiplayer is **dropped from the first build** (decision 2026-08-08). Multiplayer lobbies are now a cloud-relay paid feature: a Deckd Master pass is required to host, guests join free.

The repo still contains a native BLE scaffold, protocol messages, and transport code. Treat it as an unproven research/prototype track. If it is ever revisited as a free local bonus, it must first prove on physical devices:

1. host advertises
2. guest scans
3. guest connects
4. guest writes handshake/intent
5. host receives write
6. host notifies event batch
7. guest receives notification
8. reconnect/snapshot path works

Required matrix before product claims:

- iOS host to iOS guest
- Android host to Android guest
- iOS host to Android guest
- Android host to iOS guest

Until then, do not put BLE in MVP copy, app-store copy, ads, or primary UX.
