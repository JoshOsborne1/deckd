---
description: Scaffold a zustand store persisted via MMKV. Usage, `/new-store <name> [--persist]`.
---

# /new-store

Create a new zustand store under `src/store/`. Persisted stores use `lib/storage.ts -> createPlatformStorage()` so they work on native + web.

## Inputs

- `<name>` — camelCase store name (e.g. `gameStore`, `profileStore`, `bleStore`).
- `--persist` — optional. If present, the store is wrapped in zustand's `persist` middleware backed by the platform storage helper.

## Steps

1. Check that `src/store/` exists; create it if not.
2. Create `src/store/<name>.ts` from the scaffold below.
3. Add the path alias `@store/*` to `tsconfig.json` + `babel.config.js` if not present.
4. Wire the first consumer (or note in the output that the store needs a first caller).
5. Append a `STATUS.md` entry.

## Scaffold — in-memory only

```ts
// src/store/<name>.ts
import { create } from 'zustand';

export interface <Name>State {
  // state fields
}

export interface <Name>Actions {
  // actions
  reset: () => void;
}

const INITIAL_STATE: <Name>State = {
  // defaults
};

export const use<Name> = create<<Name>State & <Name>Actions>((set) => ({
  ...INITIAL_STATE,
  reset: () => set(INITIAL_STATE),
}));
```

## Scaffold — persisted

```ts
// src/store/<name>.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';

export interface <Name>State { /* ... */ }
export interface <Name>Actions { reset: () => void; }

const INITIAL_STATE: <Name>State = { /* ... */ };

export const use<Name> = create<<Name>State & <Name>Actions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      reset: () => set(INITIAL_STATE),
    }),
    {
      name: '<name>',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      // partialize: (s) => ({ ... }) // opt in only what should persist
    },
  ),
);
```

## Rules

- Never export setters that accept arbitrary state shape — expose named actions (`dealHand`, `passTurn`, `setNickname`).
- Keep selectors outside the store file if they cross stores; inline selectors for single-store use.
- Every persisted store must declare a `version` and, when the shape changes, a `migrate` function. Bumping without migration is a crash waiting to happen after cold start.
- Do not put BLE manager instances or any non-serializable objects into a persisted store.
