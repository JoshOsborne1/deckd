# Delivery Workflow

This file is the repository-owned contract for bounded code changes delivered
through native Hermes. The machine-readable rules live in the single
`delivery-json` fence below. The prose explains how implementation, proof and
review work in plain English.

## Implementation

1. Read the repository rules (`AGENTS.md`, `docs/LOOP_DIRECTIVES.md` and this
   file) before changing anything. `docs/LOOP_DIRECTIVES.md` is the living
   source of truth for what to build and wins over older docs where they
   conflict.
2. Implement only within the paths listed in `allowed_paths` in the fence.
3. Work in an isolated, project-bound worktree. Never edit a shared checkout.
4. Commit the candidate before generating proof. The candidate SHA is the
   exact revision that will be proven and reviewed.
5. Quality gates per slice: `npm run typecheck`, `npm run lint`, `npx jest`,
   `npx expo-doctor`. All must pass before proof.

## Proof

1. Run `scripts/delivery-proof.py` against the exact candidate SHA, the
   workflow file, the declared base SHA and the task ID.
2. The proof script is read-only except for its external output directory.
   It validates the contract, confirms exact Git revisions, runs the declared
   commands, and writes one bounded JSON record plus full logs outside the
   repository.
3. A `PASS` verdict is valid only for the current clean candidate SHA,
   declared base SHA, exact workflow digest and exact command list. Anything
   dirty, moved, malformed, missing or contradictory fails closed.
4. Attach the proof JSON to the card before requesting review.

## Review

1. Clear any task-level model override before requesting review so the
   reviewer profile's route applies.
2. Request same-card review with the `reviewer_profile` named in the fence.
3. The reviewer inspects the diff, validates the attached proof, reruns the
   declared commands independently, and either completes the card or requests
   changes with exact reasons.
4. The implementer never approves its own work. Production approval stays
   explicit and separate.

```delivery-json
{
  "schema_version": 1,
  "goal": "Deckd production-ready card game app: playable games, premium visuals, one felt space",
  "allowed_paths": [
    "app/**",
    "components/**",
    "src/**",
    "lib/**",
    "server/**",
    "qa/**",
    "docs/**",
    "scripts/**",
    "assets/**",
    "public/**",
    "vendor/**",
    "package.json",
    "app.json",
    "tsconfig.json",
    "eslint.config.js",
    "jest.config.js",
    "jest.setup.js",
    "babel.config.js",
    "metro.config.js",
    "STATUS.md"
  ],
  "commands": [
    {
      "argv": ["npm", "run", "typecheck"],
      "timeout_seconds": 600
    },
    {
      "argv": ["npm", "run", "lint"],
      "timeout_seconds": 600
    },
    {
      "argv": ["npx", "jest"],
      "timeout_seconds": 900
    },
    {
      "argv": ["npx", "expo-doctor"],
      "timeout_seconds": 600
    }
  ],
  "reviewer_profile": "builder",
  "production_requires_approval": true
}
```
