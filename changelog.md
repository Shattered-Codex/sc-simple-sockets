# Changelog

## 2.0.7

### Added
- Added a per-slot configuration that allows a gem to be extracted regardless of whether the global Delete Gem On Removal setting is enabled, giving finer control over socket behavior.
- Added a macro that lets you extract a gem from the selected slot regardless of whether destroy-on-removal is enabled, which works well for item interactions, vendors, or roleplay-driven gem recovery.
- Updated the remove and extract gem actions with distinct icons so each behavior is easier to identify at a glance.
- Reworked the +Details extra damage system so you can select multiple damage types or use the host item's damage type. During the roll, this lets you choose which extra damage type that gem applies.
- Added four damage roll layout options in module settings to make the extra damage granted by gems clearer during rolls.
- Added native `sc-more-activities` integration that registers socket slotting and socket extraction activities directly from `sc-simple-sockets` when both modules are active.
- Added dedicated SC More Activities activity sheets, picker dialogs, templates, and slot operation flows for adding slots, removing empty slots, and extracting gems from filled slots.
- Added slot activity configuration options for tint, description, custom cursor image, slot condition, target condition, hidden state, delete-on-removal override, and ignore-max-sockets behavior.
- Added new socket API helpers for permission checks, slot add/remove workflows, removing slots with contents, and updating slot configuration for automations and integrations.
- Added a formula mode for gem extra damage entries so a gem can use dynamic roll formulas instead of only manual number/die/bonus values.
- Added a debug setting to make troubleshooting easier.
- Added automated tests to support module development and make the system more cohesive and robust.

### Changed
- SC More Activities support now stays scoped to this module instead of relying on external activity definitions, keeping socket-specific behavior and UI inside `sc-simple-sockets`.
- Selection prompts can now use custom cursor images, with oversized assets rasterized down for more reliable cursor rendering.
- Extra damage rows now use a more stable layout in both the default and Tidy sheets, including an inline formula tooltip and better spacing between the formula toggle and manual fields.

### Fixed
- Improved Tidy sheet integration with better layout behavior and badges for activities and active effects.
- Improved the rendering flow for better performance and more stable refresh behavior.
- Improved socket mutation permission and world socket limit handling so integrations can explicitly bypass the global cap or suppress duplicate warnings when appropriate.
- Fixed gem extra damage persistence so custom formulas are stored, normalized, and validated correctly before they are injected into host damage rolls.
- Fixed the extra damage editor layout when formula mode is toggled, preventing overlapping labels and tightening the Number/Formula columns for a cleaner row.
- Added regression coverage for formula-based gem damage entries and explicit world-limit socket additions.
- Resolved several smaller bugs across the module.
