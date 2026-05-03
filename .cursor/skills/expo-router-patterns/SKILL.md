---
name: expo-router-patterns
description: How Deckd's navigation actually works (Stack + hidden Tabs + custom GlobalNavBar overlay), typed Href usage, and deep-link conventions. Use when adding a screen, changing routing, or debugging navigation.
---

# Expo Router patterns in Deckd

## Mental model

- The **root layout** (`app/_layout.tsx`) renders a `<Stack>` with two children — the `(tabs)` group and the `game` nested stack — plus a persistent `<GlobalNavBar>` overlay at the root `<View>`.
- `<GlobalNavBar>` is NOT a real tab bar. It's a custom component that calls `router.push()`. The `(tabs)` group exists only to group home/store/list/profile under a common layout; its `<Tabs>` navigator has `tabBar={() => null}`.
- Nested stacks (like `game/`) exist so sub-screens (`game/index`, `game/pass`) can transition inside their own stack without unmounting siblings.

## File → route mapping

```
app/_layout.tsx              ← root Stack + GlobalNavBar
app/(tabs)/_layout.tsx       ← Tabs wrapper (hidden bar)
app/(tabs)/index.tsx         ← /
app/(tabs)/store.tsx         ← /store
app/(tabs)/list.tsx          ← /list
app/(tabs)/profile.tsx       ← /profile
app/(tabs)/game_dummy.tsx    ← /game_dummy  (DEAD — delete)
app/game/_layout.tsx         ← game Stack
app/game/index.tsx           ← /game
app/game/pass.tsx            ← /game/pass
```

The `(tabs)` in parentheses is an **expo-router group** — it does not appear in the URL.

## Navigation rules (must follow)

1. Use `useRouter()` and `router.push('/path')`. Do not import from `@react-navigation/native`.
2. Href strings must be typed: `import type { Href } from 'expo-router'`. Prefer helpers that construct typed hrefs over inline strings in large components.
3. Never add a new top-level `<Tabs>` or `<Drawer>`. New screens go into `(tabs)/` (if they should show `GlobalNavBar`) or into a new nested stack group (`app/<flow>/_layout.tsx`).
4. Full-focus screens (e.g. `pass.tsx`) should render full-screen; if `GlobalNavBar` is visually in the way, guard it inside the component via `usePathname()` — do not conditionally render it from the root layout.

## Adding a new screen (checklist)

1. Decide: does it show `GlobalNavBar`? If yes, put it in `app/(tabs)/<name>.tsx`. If no, create a new group (e.g. `app/onboarding/_layout.tsx` + `app/onboarding/welcome.tsx`).
2. Screen component: default export, `useSafeAreaInsets()` at the top, import colors/radii/space from `@theme`.
3. If the screen needs global nav state, also update `components/GlobalNavBar.tsx`'s `navCards` array and `isActivePath()`.
4. Add a `STATUS.md` entry with the new route and its purpose.
5. If deep-linkable, confirm the scheme `deckd://` path works (`deckd://<route>`).

## Scaffold (copy-paste)

```tsx
// app/(tabs)/my-screen.tsx
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, fonts } from '@theme';

export default function MyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.title}>My Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl },
  title: { fontFamily: fonts.extra, fontSize: 28, color: colors.ink },
});
```

## Deep linking

- Scheme: `deckd://` (declared in `app.json -> scheme`).
- Route `app/game/pass.tsx` → `deckd://game/pass`.
- When adding a deep-linkable route, log it in `STATUS.md` under a `Deep links` subsection so marketing/support can reference it.

## Active-path logic

`GlobalNavBar`'s `isActivePath(pathname, href)` handles root (`'/'`) and prefix matches. If you add a nested route that should highlight a parent tab (e.g. `/store/bundle/123` highlights "Store"), extend `isActivePath` — do not duplicate the logic inline.

## Anti-patterns

- Local `GlobalNavBar` render inside a screen.
- Using stack route names (`navigation.navigate('MyScreen')`) — this app is URL-first.
- Creating a placeholder screen file like `game_dummy.tsx` just to appease a tab registration. Either it's a real route or it's not registered.
- Passing complex objects via route params. Use a store.
