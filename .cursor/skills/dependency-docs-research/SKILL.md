---
name: dependency-docs-research
description: Requires looking up official documentation and version sources before changing dependencies, tooling, or config—no guessing versions, flags, or APIs. Use when adding or upgrading npm packages, changing Expo/React Native/Metro/Babel/EAS settings, resolving peer dependency errors, or answering “does X work with Y?”
---

# Dependency and tooling documentation (no guessing)

## Core rule

Before recommending or applying **dependency versions**, **CLI flags**, **config keys**, or **breaking API usage**, the agent must **confirm against primary sources**. If docs cannot be reached, **say so** and use the next-best official channel (`--help`, installed package `README`, version matrix in repo)—do not invent details.

## When this skill applies

- Adding, removing, or bumping **npm/yarn/pnpm** dependencies (including devDependencies).
- **Expo** (SDK, `app.json` / `app.config`, plugins, `expo-router`, `expo install`, EAS).
- **React Native**, **Metro**, **Reanimated**, **Hermes**, native modules, **CMake**/Gradle where documented.
- Resolving **peer dependency**, **incompatible SDK**, or **Expo Go vs dev client** questions.
- Suggesting **environment variables** or **workarounds** (must cite doc or tracked issue).

## Required workflow (minimal)

1. **Identify the canonical source** for the change:
   - **Expo** → [https://docs.expo.dev](https://docs.expo.dev) (current SDK guide, `expo install`, workflow docs).
   - **React Native** → [https://reactnative.dev](https://reactnative.dev) (docs for the RN version in the project).
   - **Package** → registry page + **GitHub repo README** + **CHANGELOG** / release notes.
   - **Node / npm** → [https://nodejs.org](https://nodejs.org) / [https://docs.npmjs.com](https://docs.npmjs.com) when relevant.

2. **Read version truth from the repo or toolchain**, not from memory:
   - Inspect `package.json`, `package-lock.json` / lockfile, `app.json`, `eas.json`, `babel.config.js`, `metro.config.*`.
   - For Expo alignment: run or instruct **`npx expo install --check`** / **`npx expo-doctor`** when validating a machine state (do not substitute guessing).

3. **Verify flags and config**:
   - Prefer **`npx expo start --help`** (or the relevant CLI’s `--help`) over assuming flags exist.
   - Prefer **linked SDK docs** for `app.json` / plugin schema.

4. **After research**, implement or advise in a way that **matches what the docs say**. If docs conflict with local files, **call out the conflict** and default to **pinned versions in the project** until the user upgrades intentionally.

## Acceptable evidence (in order of preference)

1. Official documentation pages (fetched or opened in editor).
2. **Maintainer-published** README / migration guide in the package repo.
3. CLI **`--help`** output from the **same major version** the project uses.
4. **Lockfile + bundled SDK manifests** inside `node_modules` (e.g. `expo/bundledNativeModules.json`) when verifying “what Expo 54 expects.”
5. **GitHub issue / changelog** from the owning org—label clearly as issue-driven, not primary spec.

## Do not do

- **Do not** guess **semver ranges**, **peer dependency** outcomes, or “latest compatible” versions without checking.
- **Do not** stack **unverified env vars** (`NODE_OPTIONS`, `EXPO_*`, proxies) as a first resort; only use them when docs or maintainers recommend them.
- **Do not** treat **forum posts / random blogs** as authoritative unless they **quote** official docs or reproduce CLI output.
- **Do not** recommend **`npm install <pkg>@latest`** for **Expo/RN native** packages without **`npx expo install`** (or equivalent doc-driven) alignment.

## Short checklist (copy mentally)

- [ ] Identified **official doc** or **package readme** for this change.
- [ ] Confirmed **version / flag** against doc, `--help`, or **project lockfile**.
- [ ] If Expo: considered **Expo Go constraints** vs **dev build** per docs.
- [ ] Stated **uncertainty** where docs are silent instead of fabricating.

## Project-specific note (Deckd)

This repo uses **Expo SDK 54** and **Expo Router 6**. For native modules (e.g. BLE), check **Expo Go limitation** docs before assuming a library works in Go; prefer **`expo install`** and **EAS / dev client** documentation when native code is required.
