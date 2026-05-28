# Changelog

## 2.0.7

### Added
- Added a per-slot configuration that allows a gem to be extracted regardless of whether the global Delete Gem On Removal setting is enabled, giving finer control over socket behavior.
- Added a macro that lets you extract a gem from the selected slot regardless of whether destroy-on-removal is enabled, which works well for item interactions, vendors, or roleplay-driven gem recovery.
- Updated the remove and extract gem actions with distinct icons so each behavior is easier to identify at a glance.
- Reworked the +Details extra damage system so you can select multiple damage types or use the host item's damage type. During the roll, this lets you choose which extra damage type that gem applies.
- Added four damage roll layout options in module settings to make the extra damage granted by gems clearer during rolls.
- Added a debug setting to make troubleshooting easier.
- Added automated tests to support module development and make the system more cohesive and robust.

### Fixed
- Improved Tidy sheet integration with better layout behavior and badges for activities and active effects.
- Improved the rendering flow for better performance and more stable refresh behavior.
- Resolved several smaller bugs across the module.
