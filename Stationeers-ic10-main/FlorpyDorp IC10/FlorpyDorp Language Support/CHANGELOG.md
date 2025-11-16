### Changelog Beginning 11-01-2025

## [1.2.5] - 2025-11-15

### ✨ New Features
- **Stationeers IC10 Editor Theme**: Added complete UI color theme matching in-game editor aesthetics
  - Deep blue-teal editor background (#0a2838) matching game console
  - Orange accents (#FFA500) for tabs, status bar, and highlights
  - Dark blue sidebar (#062030) and activity bar (#041820)
  - Orange window border when active
  - Complete coverage: editor, tabs, sidebar, terminal, menus, notifications, and more
- **Theme Toggle Command**: Press **Ctrl+Alt+T** to switch between Stationeers Dark and your previous theme
  - Remembers your previous theme across sessions
  - Works globally from any file type
- **Register Diagnostic Suppression**: Added `# ignore` directive to suppress false-positive register warnings
  - Manual: Add `# ignore r1, r2` anywhere in your code
  - Code Action: Click lightbulb on register diagnostic → "Ignore diagnostics for rX"
  - Hotkey: Press **Ctrl+Alt+I** to suppress all register diagnostics at once
- **LogicType Value Tracking**: Extension now tracks when registers hold LogicType values
  - `move LogicType.Power r0` marks r0 as holding a LogicType
  - Registers with LogicType or Number values accepted where LogicType parameters expected
  - Arithmetic operations on LogicType constants correctly produce Number values
- **Complete Device Hash Database**: Updated to include all 1248 devices from Stationpedia
  - HASH() inlay hints now show friendly device names instead of numeric hashes
  - Added previously missing devices like StructureTankSmallInsulated
- **Added LogicType**: `TargetSlotIndex` now recognized in grammar and LSP
- Added support for `get`, `getd`, `put`, `putd` operations in tree-sitter grammar
- Improved type system with Unknown value kind for runtime-determined values (get/pop/peek)
- Register references (rr0-rr15) now treated as implicitly initialized like `sp`

### 🐛 Bug Fixes
- Fixed LogicType semantic highlighting to use orange color in both themes
- Fixed "register read before assign" errors for rr0-rr15 indirect addressing registers
- Fixed device parameter type checking to accept Unknown value kind from get operations
- Fixed db:0-7 network channel type mismatches (channels can store any data type)
- Fixed LogicType parameter validation to accept registers with numeric values
- Fixed label colors to use darker purple (#800080) matching original theme

### 🔧 Improvements
- Optional colon in ignore directive (`# ignore` or `# ignore:` both work)
- Code actions now properly identify register diagnostics for individual suppression
- Better static analysis handling for complex control flow with jumps and loops
- Keybinding changed from Ctrl+Alt+R to Ctrl+Alt+I to avoid conflicts
- Enhanced semantic token colors for consistent LogicType display across themes

## [1.2.1] - 2025-11-15

### 🐛 Bug Fixes
- Fixed VS Code variable resolution for extension path (now works in both VS Code and VS Code Insiders)
- Added proper error handling and helpful error messages when LSP binary is not found
- Enhanced extension startup validation with file existence checks

### 🔧 Improvements
- Improved documentation with comprehensive guides (README, DEVELOPER_GUIDE, CONFIGURATION, QUICK_REFERENCE)
- Enhanced code comments throughout Rust LSP and TypeScript extension
- Better troubleshooting information for common issues

## [1.1.0] - 2025-11-15
- Added new grey shadow text that follows cursor as you type
- Fixed instruction descriptions so they match in game
- Variables & enums now properly display
- Added lots of missing strucutre prefabs and hashs
- HASH("") should properly read as a number now
- ra & sp should no longer incorrectly get marked as having no value
- Labels should be recognized no matter where they are
- Variables should show as a teal color 
- Added hundreds missing variabls & enums
- Got some other fixes in I can't even remember.

## [1.1.0]
- I skipped this by accident so we jumped right to 1.2....

### FlorpyDorp Era 1.0 Changes

## ✨ Features
- HASH() in defines now behaves like a number everywhere
  - `define StartButton HASH("StructureButton")` resolves to a numeric constant
  - Hover/inlay hints show friendly names and values consistently

## 🐛 Bug Fixes
- Fixed LSP crash on startup caused by querying a non-existent `function_call` node
  - Uses `hash_preproc` (as defined by the grammar) for HASH detection/inlays
- Eliminated “Cannot call write after a stream was destroyed” during restarts
  - Guarded client restarts and queued config/diagnostic notifications until the server is running
- Restored operand typing for `hash_preproc` so HASH operands are treated as numbers
- Diagnostics toggle more reliable; reduces stale squiggles and avoids mid-shutdown writes

## 🔧 Developer Notes
- Added targeted regression test for HASH defines recognition
- Updated extension client to await `start()` instead of using `onReady()`
