# Automated Tests

This repository now includes a minimal Node-based automated test suite focused on regression coverage for pure or lightly mocked logic.

## Scope

The suite covers:

- socket slot config normalization and visibility rules
- `SocketSlot` state transitions
- `ItemResolver` snapshot compaction and slot sanitization
- socket description entry building with lightweight `foundry`/`game` mocks

The tests intentionally avoid Foundry runtime bootstrapping. They are designed to catch logic regressions cheaply during local development.

## Requirements

- Node.js 20 or newer

No external dependencies are required.

## Run

From the module root:

```bash
npm test
```

Or directly with Node:

```bash
node --test
```

## Files

- `tests/support/foundryStubs.js`: minimal shared stubs for `foundry`, `game`, and common Foundry utils
- `tests/socketSlotConfig.test.js`
- `tests/SocketSlot.test.js`
- `tests/ItemResolver.test.js`
- `tests/buildSocketDescriptionEntries.test.js`

## Notes

- The suite is intentionally narrow. It targets logic that can run outside Foundry without introducing a heavy harness.
- When adding tests, prefer the same pattern: isolate pure helpers first, then add small mocks only where the logic depends on `foundry` or `game`.
