---
description: Scaffold a new expo-router screen with theme + safe-area boilerplate. Usage, `/new-screen <name> [--flow <flow>]`.
---

# /new-screen

Scaffold a new screen following the project's navigation patterns.

## Inputs

- `<name>` — kebab-case screen name (e.g. `settings`, `bundle-detail`).
- `--flow <flow>` — optional. If provided, the screen lives in `app/<flow>/` as a nested stack child (creates `_layout.tsx` if missing). If omitted, the screen lives in `app/(tabs)/` and will show `GlobalNavBar`.

## Steps

1. Read `.cursor/skills/expo-router-patterns/SKILL.md` to confirm the routing model.
2. Decide placement based on `--flow` — warn the user if `GlobalNavBar` behavior is unexpected for their intent.
3. Create the screen file from the scaffold below. Import from `@theme` if it exists, or use a relative path to `src/lib/theme.ts`. If neither exists, follow the `deckd-theme-tokens` skill to create the theme module first.
4. If inside `(tabs)`, add the screen to `components/GlobalNavBar.tsx -> navCards` only if it deserves a nav entry. Many screens do not.
5. Append a `STATUS.md` entry noting the new route.

## Scaffold

```tsx
// app/(tabs)/<name>.tsx OR app/<flow>/<name>.tsx
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radii, fonts } from '@theme';

export default function <Name>() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}><Title></Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxxxl * 3 },
  title: { fontFamily: fonts.extra, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
});
```

## Do not

- Do not hand-register routes in a JSON config — expo-router discovers files automatically.
- Do not add a new `<Tabs>` navigator.
- Do not ship placeholder screens with `<Text>Page</Text>` — at minimum give them a heading and a stable empty-state layout.
