# ADR-0001: Session topology is four independent concerns

- Status: Accepted
- Date: 2026-08-24
- Decision scope: Phase 0 contract for the controlled physical-card rebuild
- Source: `.hermes/plans/2026-08-23_201024-deckd-physical-card-rebuild-blueprint.md` §7.1

## Context

The legacy `SessionMeta.mode` is a mode soup. Values such as `pass`, `solo`, `ble-host`, `ble-guest`, `online-host`, and `online-guest` mix authority, delivery mechanism, device surface, privacy role, and seat ownership. That forces every new surface or transport through engine and presentation branches, and makes the canonical game state care about how it is being viewed.

Deckd is one table projected onto different devices and arrangements. A session may be local or networked, nearby or internet-connected, shared by several people or bound to one seat, without changing the rules state or the legal card moves.

## Decision

The session topology is represented as four independent typed values:

```ts
type Authority =
  | { kind: 'local' }
  | { kind: 'nearby-host'; peerId: string }
  | { kind: 'cloud-server'; roomId: string };

type TransportKind = 'in-process' | 'relay' | 'nearby';

type SurfaceProfile =
  | 'hot-seat'
  | 'personal-table'
  | 'dual-end-board'
  | 'public-table'
  | 'private-hand';

type SeatBinding =
  | { kind: 'single-seat'; playerId: string }
  | { kind: 'shared-device'; playerIds: string[] }
  | { kind: 'table-only' };
```

`SessionMeta.mode` is removed from the new canonical contract. During migration, the legacy field may remain in a compatibility adapter for persisted sessions and older relay messages, but it is derived input/output only; new runtime decisions must read the four topology values.

The product's four surface modes map to these profiles as follows:

| Product mode | Surface profile tuple | Seat binding | Typical authority/transport |
| --- | --- | --- | --- |
| Hot-seat pass-and-play | `hot-seat` | `shared-device` | `local` + `in-process` |
| Personal-device online | `personal-table` | `single-seat` | `cloud-server` + `relay` |
| Personal-device nearby | `personal-table` | `single-seat` | `nearby-host` + `nearby` |
| Dual-end board | `dual-end-board` | `shared-device` | `local` + `in-process` |
| Phone Deck table | `public-table` | `table-only` | nearby host or cloud server |
| Phone Deck hand | `private-hand` | `single-seat` | same room authority as its table |

The Phone Deck product mode is therefore a coordinated `public-table` plus one or more `private-hand` projections, not a sixth canonical mode. Device role and authority remain independent.

## Rationale

- **Rules stability:** the framework-free engine folds the same canonical state regardless of device or transport.
- **Combinatorial control:** adding a transport or surface does not multiply game-specific mode branches.
- **Privacy clarity:** seat binding and surface role explain what a viewer may see; transport does not.
- **Honest nearby semantics:** a nearby host is explicitly trusted, while cloud rooms move authority to the server.
- **Migration safety:** existing sessions can be adapted without a big-bang rewrite.

## Consequences

### Positive

- Runtime, projection, and presentation code can be tested independently.
- Unsupported game/surface combinations can be withheld without inventing new engine modes.
- Reconnect, snapshot, and diagnostics can use the same topology contract.

### Costs and constraints

- Session creation must validate compatible combinations instead of accepting one free-form mode string.
- Persisted legacy sessions need a deterministic compatibility mapping.
- A Phone Deck has multiple clients with different surface profiles but one authoritative session.
- Phase 2 must carry both the legacy field and the new values until all readers and writers are migrated.

## Migration and acceptance

1. Add the four values beside the legacy mode in the Phase 2 compatibility adapter; do not change rules behaviour.
2. Map every legacy mode explicitly and test unknown values as a non-destructive error.
3. Assert that reducer inputs and replay fixtures do not branch on transport or surface profile.
4. Assert that each projection receives its topology role before serialisation.
5. Remove `SessionMeta.mode` only after all persisted-session, relay, QA, and recovery readers are migrated.

## Rejected alternatives

- A larger enum containing every combination (`online-guest`, `nearby-host`, `dual-end-host`, and so on): this recreates mode soup.
- Putting transport and viewer role in `GameState`: it couples rules to presentation and leaks privacy assumptions.
- Replacing the existing engine with `boardgame.io`: the current engine already provides deterministic reducers, rules, and event logs; the migration cost does not solve physical interaction.
