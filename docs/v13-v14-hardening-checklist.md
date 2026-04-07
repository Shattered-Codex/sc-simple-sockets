# v13/v14 Hardening Checklist

## P0

- Make socket insert/remove transactional in `scripts/core/services/SocketService.js`.
- Reduce direct use of `dnd5e` internals in `scripts/core/services/ActivityTransferService.js`.
- Keep actor and item sheets visually in sync after socket changes, effect changes, and activity transfers.
- Stabilize `GemDamageService` against `dnd5e` hook/version drift.

## P1

- Split `scripts/core/integration/TidyIntegration.js` into smaller adapters.
- Remove writes to Tidy item flags from render-time paths where possible.
- Replace rigid DOM selectors in badge/render helpers with version-aware selectors and fallbacks.
- Add capability checks for `dnd5e`, `tidy5e-sheet`, and `libWrapper` before enabling optional features.

## P2

- Centralize Foundry/`dnd5e` compatibility helpers in one module.
- Add structured logging around socket lifecycle failures.
- Tighten manifest and README compatibility statements so they match the actual runtime requirements.
- Add automated smoke coverage for socket add/remove, gem transfer, and actor-sheet badge refresh.
