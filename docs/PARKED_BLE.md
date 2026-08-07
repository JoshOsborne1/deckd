# Parked BLE track

BLE is not part of the v1 build target.

The repo contains a native BLE scaffold, protocol messages, and transport code. Treat it as an unproven research/prototype track until physical devices prove:

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
