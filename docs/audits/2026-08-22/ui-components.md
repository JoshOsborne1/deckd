## Deckd UI/App Shell Audit

### What I did
- Read-only review of `components/`, `app/`, drag/gesture infrastructure, and card primitives.
- Checked recent Git state.
- Ran `npm run typecheck` — **passed**.
- No files created or modified.

## Findings

### 1. 🟠 P1 — All major layers remain mounted and subscribed while hidden

**Location:** `app/index.tsx:113-142`

`HomeLayer`, `HubLayer`, `TableLayer`, `LobbyLayer`, `PassLayer`, and transition surfaces are all rendered unconditionally. Visibility is controlled through props, opacity, and `pointerEvents`, but hidden layers still execute hooks, subscribe to stores, calculate derived values, and retain their complete component trees.

This is especially costly because `TableLayer` itself subscribes to broad game objects and contains the generic table plus multiple game-specific render paths.

**Fix:**

```tsx
{viewMode === 'hub' || viewMode === 'home' ? (
  <HubLayer ... />
) : null}

{viewMode === 'table' || viewMode === 'pass' ? (
  <TableLayer ... />
) : null}
```

If cross-fade continuity requires mounting both adjacent surfaces, mount only the current and previous surface rather than the entire application layer set.

**Verify:** Use React DevTools Profiler while dispatching drag/game events. Hidden layers should show no render commits during an active table drag.

---

### 2. 🟠 P1 — `TableLayer` subscribes to entire `state` and `events`, making every event a full 2,183-line render

**Location:** `components/layers/TableLayer.tsx:301-312`

```tsx
const state = useGameStore((s) => s.state);
const events = useGameStore((s) => s.events);
```

Any game action, drag result, remote event, history update, or state replacement causes the entire `TableLayer` to rerender. The component then recalculates many selectors (`drawCount`, `localHand`, `opponents`, `ruleActions`, `communityCards`, etc.) and reconstructs the table JSX.

The `useMemo` calls do not prevent the parent render; they only reduce some derived computation.

**Fix:** Split the table into memoized regions and subscribe narrowly:

```tsx
const phase = useGameStore((s) => s.state.phase);
const currentPlayerId = useGameStore((s) => s.state.currentPlayerId);
const localHandIds = useGameStore(
  useShallow((s) => selectLocalHandIds(s.state, viewerId)),
);
```

Recommended extraction boundaries:
- `TableHeader`
- `OpponentRail`
- `TableMiddle`
- `DrawDiscardControls`
- `PlayerHand`
- `RuleActionBar`
- `EndedBanner`

Pass primitive values or stable arrays into `React.memo` children.

**Verify:** Add temporary render counters to each extracted region. A hand drag should not rerender header, opponent rail, or static table chrome.

---

### 3. 🟠 P1 — Card drag hand performs layout measurement for every card and remeasures all cards during scroll

**Location:** `components/CardDragHand.tsx:61-85`, `95-101`, `104-121`

Every card ref calls `measureInWindow`, and `measureAllSlots()` measures every registered slot after scroll frames. On a large hand this means repeated native/UI-to-JS measurement and repeated `setSlots` object construction.

The autoplay effect also depends on object identities:

```tsx
[cardSize.width, cards, measureAllSlots, measureOrigin, overlap, playableCardIds]
```

If the store produces a new `cards` array or `playableCardIds` set on ordinary game updates, the scroll-to-playable and full measurement sequence runs again.

**Fix:**
- Measure only when card order, size, or container position changes.
- Keep geometry in a shared/imperative ref where possible.
- Avoid remeasuring every slot on every scroll event; update only the hand origin and derive card positions from index/overlap.
- Depend on a stable card-order key rather than the complete `cards` array.

```tsx
const cardOrderKey = cards.map((c) => c.id).join(',');
```

**Verify:** Profile a 20+ card hand while scrolling. `measureInWindow` calls and `setSlots` updates should not occur continuously at 60 Hz.

---

### 4. 🟡 P1 — Inline style objects and arrays are recreated for every card render

**Locations:**
- `components/CardDragHand.tsx:163-166`, `173-180`
- `components/CardDragHand.tsx:203-216`
- `components/layers/TableLayer.tsx:1028-1035`
- `components/layers/TableLayer.tsx:1142-1145`, `1459`
- `components/layers/HubLayer.tsx` card/list render sections

Examples:

```tsx
const cardStyle = fan
  ? { transform: [{ translateY: ... }, { rotate: ... }] }
  : undefined;
```

and:

```tsx
style={{ zIndex: cardIndex + 1 }}
```

These defeat shallow prop equality for memoized children and cause `PlayingCard`, `CardDrag`, and animated wrappers to receive new style identities on each parent render.

`PlayingCard` is correctly wrapped in `React.memo` at `PlayingCard.tsx:79`, but its `style` prop frequently changes identity regardless of visual equality.

**Fix:**
- Extract each card into a memoized `HandCard` component.
- Use stable style IDs or calculate styles inside the child from primitive props.
- Prefer static StyleSheet entries for fixed styles and animated styles for transforms.

```tsx
const HandCard = React.memo(function HandCard({ index, ...props }) {
  const cardStyle = useMemo(
    () => makeFanStyle(index, props.cardCount),
    [index, props.cardCount],
  );
  return <PlayingCard {...props} style={cardStyle} />;
});
```

**Verify:** React Profiler should show unchanged cards skipped when one card is dragged or played.

---

### 5. 🟡 P1 — Drop-target highlight cost multiplies by cards × targets

**Location:** `components/CardDrag.tsx:45-79`, `178-181`

Each draggable card renders a `TargetHighlight` for every drop target:

```tsx
{dropTargets.map((target) => (
  <TargetHighlight key={target.id} ... />
))}
```

Each target owns a separate `useAnimatedStyle`. With several playable cards and several targets, the number of animated nodes grows multiplicatively. `CardDragHand` also creates one `CardDrag` per playable card at `198-229`.

The actual active target is a single shared value, so rendering all target rings inside every card is unnecessary.

**Fix:** Render one target-highlight layer per hand/table, outside individual cards, and pass only the active target geometry to it. Alternatively, render highlights only for the currently lifted card.

```tsx
const activeDragId = useSharedValue<string | null>(null);
// One <DropTargetOverlay /> at table level.
```

**Verify:** Inspect the UI hierarchy and frame timing with 10 playable cards and 4 targets. Target overlay count should remain constant rather than reach 40 animated nodes.

---

### 6. 🟡 P1 — Drag gesture closure is rebuilt whenever geometry/target array identities change

**Location:** `src/hooks/useCardDrag.ts:104-224`

The `Gesture.Pan()` object is memoized, but its dependency list includes:

```tsx
cardSize,
dropTargets,
slot,
```

These are commonly object/array props created during parent renders. As a result, every geometry update or new target array rebuilds the native gesture object for every card.

The worklet does correctly perform pointer tracking and hit testing on the UI thread (`120-133`), which is good, but rebuilding all gestures during scroll/layout updates can introduce avoidable churn.

**Fix:**
- Pass primitive geometry values or stable objects.
- Memoize `dropTargets` at the table level.
- Store changing slot geometry in shared values or refs rather than gesture dependencies where possible.
- Keep only callback and enablement changes in the gesture dependency set.

**Verify:** During hand scrolling, confirm gesture instances are not recreated for every scroll frame.

---

### 7. 🟡 P1 — Fixed navigation dimensions leave little usable height on a 375px iPhone

**Locations:**
- `components/GlobalNavBar.tsx:437-488`
- `components/CardDragHand.tsx:235-240`
- `app/index.tsx:121-133`

The global navigation reserves a substantial fixed footprint:

```tsx
rail: { minHeight: NAV_BAR_RESERVE }
slot: { height: 122 }
hit: { minHeight: 112 }
logoHit: { minHeight: 118 }
```

The hand also reserves `minHeight: 142`. Combined with safe-area bottom inset, table header/top inset, action bars, and card controls, this creates a significant vertical squeeze on a 667px-tall iPhone SE-class viewport and may force overlap or clipped controls.

**Fix:**
- Make nav height responsive to available height.
- Reduce card-hand reserve on compact devices.
- Use `useWindowDimensions()` and a compact layout breakpoint.
- Keep the primary action row above the nav safe-area reserve.

```tsx
const compactHeight = height < 720;
const handMinHeight = compactHeight ? 112 : 142;
```

**Verify:** Test Expo Go at 375×667 and 375×812 with all presets, especially Poker, Blackjack, Sevens, and the generic table. Check that CTA/action buttons remain fully visible and at least 44×44.

---

### 8. 🟡 P2 — Table component is a large conditional monolith with duplicate per-game infrastructure

**Location:** `components/layers/TableLayer.tsx:352-415`, `916-979`, remainder through line 2,183

`TableLayer` performs game identification, selector setup, action derivation, generic layout, and dispatch behavior before branching into dedicated game tables. Even dedicated games still cause the parent `TableLayer` to subscribe and run its setup work before returning `CrazyEightsTable`, `SevensTable`, `SolitaireBoard`, `BlackjackTable`, or `PokerTable`.

**Clean extraction candidates:**
1. `useTableSessionContext()` — viewer, host, guest/online state.
2. `useTableDerivedState()` — hand, opponents, actions, discard, turn.
3. `TableRoute` — chooses the dedicated game surface.
4. `GenericTableSurface` — current generic render branch.
5. `TableControls` / `TableHeader` / `OpponentRail`.
6. `CardEntrance` / community-card animation primitives.

**Fix:** Move game routing above expensive generic selector setup:

```tsx
function TableLayer(props) {
  const presetId = useGameStore((s) => s.state.config.presetId);

  if (presetId === 'poker') return <PokerTable {...props} />;
  if (presetId === 'blackjack') return <BlackjackTable {...props} />;

  return <GenericTableLayer {...props} />;
}
```

**Verify:** Dedicated game surfaces should not execute generic table selectors or render counters.

---

### 9. 🟢 P2 — Accessibility labels expose internal card IDs rather than useful card names

**Location:** `components/CardDragHand.tsx:217`, `components/CardDrag.tsx:163`

```tsx
accessibilityLabel={`Card ${card.id}`}
```

This may announce implementation identifiers rather than “Queen of Hearts” or “face-down card.” The drag hint is present, and `PlayingCard` correctly exposes button semantics when pressable, but the drag overlay should provide human-readable labels.

**Fix:**

```tsx
const label =
  card.face === 'down'
    ? 'Face-down card'
    : `${rankName(parsed.rank)} of ${suitName(parsed.suit)}`;
```

Also ensure each action label describes the result, such as “Play to discard pile,” not only the internal target ID.

**Verify:** VoiceOver/TalkBack and RN web accessibility tree at 375px.

## Highest-leverage fixes

1. **Stop mounting/subscribing every hidden layer** in `app/index.tsx`.
2. **Split `TableLayer` into memoized regions with narrow Zustand selectors.**
3. **Replace per-card/per-target highlight trees with one table-level overlay.**
4. **Remove full-hand measurement on scroll; derive positions instead of calling `measureInWindow` for every card.**
5. **Introduce compact 375px layout rules and verify vertical action/nav collisions on real Expo Go devices.**

**Overall:** TypeScript is clean, and drag animation/hit testing is correctly UI-thread-oriented. The main risk is not a type/runtime failure; it is avoidable render and layout work accumulated by the always-mounted shell, broad table subscriptions, repeated card measurement, and per-card gesture/target trees.