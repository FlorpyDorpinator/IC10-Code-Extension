# FlorpyDorp IC10 Language Support for Stationeers

This Visual Studio Code extension (rebranded from prior AnexGohan's naming) provides syntax highlighting, IntelliSense, hover documentation, and deep tooling for the IC10 MIPS-like language used in Stationeers. It mirrors the in-game editor formatting and color palette for instruction signatures and parameters.

## New FlorpyDorp Additions

- Diagnostics toggle and immediate UX improvements
  - A runtime diagnostics toggle (configurable and bound in the extension) now clears squiggles immediately and restarts the language server to ensure state is in sync. (Ctrl Alt D)

- Completion and identifier handling
  - Static parameter completions (LogicType, SlotLogicType, BatchMode) are now case-insensitive and tolerant of leading spaces, so tokens like `ReferenceId` and `BestContactFilter` appear even when typed in lowercase.
  - Static completions use a token-like icon for better visual parity with in-game tokens.

- New logic / batch tokens
  - The server's instruction database has been expanded with additional logic tokens such as ReferenceId, BestContactFilter, CelestialHash, EntityState, Apex, VelocityX/Y/Z, Orientation, Forward, Density, TotalQuantity, MinedQuantity, Channel0–Channel7 and more.

- Type inference and acceptance of ReferenceId
  - Loads (l, lb, lbn and friends) now accept `ReferenceId` and certain aggregator batch modes (Minimum/Maximum) and will mark registers that hold ReferenceId values as DeviceId where appropriate — reducing false-positive diagnostics for common patterns.

- Hover and signature improvements
  - Hover tooltips better preserve and display IC10-style code blocks and examples. Special-case hover handling ensures logic-type names (e.g., `ReferenceId`) show helpful inline docs even when parsed as identifiers.

- Inlay hints and UI polish
  - Inlay hints were repositioned to appear to the right of typed operands (so they don't obstruct typing) and to mirror game-style signature hints while typing.

- Tests, build and packaging niceties
  - Added tests and example IC10 files that exercise the ReferenceId/lb/lbn patterns. The extension build process and a proper VS Code build task were added to simplify packaging.



## Original Anex Features

- **Syntax highlighting** for IC10 language files (`.ic10`)
- **Code autocompletion** with intelligent suggestions for all IC10 instructions
- **🆕 Enhanced Hover Documentation** - Comprehensive instruction guides with examples and history
  - **Complete Instruction Coverage** - Documentation for all 80+ IC10 instructions including batch operations
  - **Multi-Example Learning** - 3+ examples per instruction (simple → intermediate → advanced)
  - **Register Operation History** - See chronological history of all operations performed on registers
  - **Syntax-Highlighted Examples** - Proper IC10 code rendering in hover tooltips
  - **Categorized Discovery** - 8 instruction categories (Arithmetic, Device I/O, Batch Operations, etc.)
  - **Related Instructions** - Quick discovery of similar commands through enhanced tooltips
- **Signature help** for function parameters and instruction usage
- **Go to definition** for labels and variables
- **Diagnostics** with comprehensive syntax error detection and code length limits
- **HASH() Function Support** - Advanced device hash calculations with inline hints
  - `define Pump HASH("StructureVolumePump")` → Shows "Volume Pump" inline hint
  - `define Sensor -1252983604` → Shows "Gas Sensor" inline hint  
  - **100+ devices supported** including all common IC10 automation devices
  - **Smart typo handling** (e.g., "StructurePipeAnalysizer" works correctly)
  - **Hover tooltips** show device names for hash values in your code
- **Enhanced Language Server** with improved performance and stability
- **Code length validation** - Warns when approaching Stationeers' 4096-byte limit
- **Comprehensive instruction database** with latest Stationeers updates

## Usage

After installing the extension, open any `.ic10` file in VS Code. The extension will automatically activate and provide language features.

**Key Features:**
- **Enhanced Hover Documentation**: Complete instruction guides with examples and register operation history
- **Smart Completions**: Type instruction names to see all available options with documentation
- **HASH() Tooltips**: Hover over device hashes to see friendly device names
- **Error Detection**: Real-time syntax checking and 4096-byte limit warnings
- **Quick Navigation**: Go-to-definition for labels and variables

## Configuration

The extension supports several VS Code settings:
- `ic10.lsp.max_lines`: Maximum lines allowed (default: 128)
- `ic10.lsp.max_columns`: Maximum columns per line (default: 90)  
- `ic10.lsp.max_bytes`: Maximum total bytes (default: 4096)
- `ic10.useRemoteLanguageServer`: Use remote LSP server for development

## Issues & Feedback

Found a bug or have a suggestion? Please open an issue on the FlorpyDorp repository (update URL if repository has moved): `https://github.com/FlorpyDorp/Stationeers-ic10/issues`.


## License

This extension is released under the [MIT License](https://opensource.org/licenses/MIT).

## Credits

This project builds upon the excellent work of:
- **[Anexgohan] (https://github.com/Anexgohan)** for their creation of this IC10 Extension originally
- **[Xandaros](https://github.com/Xandaros)** for the original `ic10lsp` language server.
- **[awilliamson](https://github.com/awilliamson)** for the original `ic10-language-support` VS Code extension.
- Community contributors for instruction parity research and hover formatting alignment with the in-game editor.
