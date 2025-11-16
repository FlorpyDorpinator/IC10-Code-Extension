# FlorpyDorp IC10 Language Support  
================================

## Advanced IC10 editing, documentation, device hashing, and completion tools for Stationeers. Code in STYLE!

 ### FlorpyDorp IC10 L.S. is a complete and actively maintained IC10 extension for VS Code. It provides deep IC10 language intelligence, rich hover documentation, expanded tokens, code diagnostics, device hashing tools, and quality-of-life enhancements built on years of community work.

---

## ✨ Highlights

- Full IC10 syntax highlighting (`.ic10`)
- **Two immersive color themes**: IC10 In-Game Colors (syntax) and Stationeers Dark (full UI) with a hotkey to swap
- Intelligent autocompletion for all IC10 instructions
- Operand suggestions for LogicType, SlotLogicType, BatchMode, DeviceIO, and more
- Multi-example hover documentation for 80+ instructions
- Expanded instruction descriptions and category grouping
- Instant diagnostics toggle (Ctrl+Alt+D)
- Theme toggle between Stationeers and your preferred theme (Ctrl+Alt+T)
- Inline device names from both `HASH()` and numeric hash values
- Inlay hints that avoid covering typed code
- Hundreds of missing variables, enums, tokens, and structure hashes
- Code length warnings approaching the 4096-byte IC10 limit
- Consistent handling of labels, defines, and parameter patterns

---

## 📚 Hover Documentation

Hover over any instruction to see:

- A category (Arithmetic, Control Flow, Device I/O, Batch Ops, etc.)
- A full description
- 3 or more examples (simple → intermediate → advanced)
- Syntax-highlighted IC10 code
- Related instruction references
- Register operation history for clarity

This turns the editor into a live IC10 reference.

---

## 🔢 Device Hash Support

The extension understands both string-based and numeric hash values:

```ic10
define Pump   HASH("StructureVolumePump")   ; → Volume Pump
define Sensor -1252983604                   ; → Gas Sensor
```

Features:

- 1200+ devices from complete Stationpedia database
- Hover tooltips for device names  
- Smart typo handling for common Stationeers prefab misspellings  
- `HASH()` in defines behaves exactly like a numeric constant  
- Inline hints show friendly device names instead of numeric hashes  
- A custom theme matching the colors of the game exactly!

---

## 🩺 Diagnostics & Code Tools

- Syntax validation for instructions, parameters, and registers  
- LogicType value tracking in registers for better type checking
- Line, column, and byte-limit validation  
- Unknown label/variable detection  
- Case-insensitive token resolution  
- Improved static parameter handling  

**Toggle diagnostics:**  
Press **Ctrl+Alt+D** to instantly clear squiggles and pause the language server.  
Press **Ctrl+Alt+D** again to restart it.

**Suppress register diagnostics:**  
When static analysis produces false positives for registers (common with complex jumps/loops):  
- **Manual**: Add `# ignore r1, r2` anywhere in your code  
- **Code Action**: Click the lightbulb on a register diagnostic → "Ignore diagnostics for rX"  
- **Hotkey**: Press **Ctrl+Alt+I** to suppress all register diagnostics at once

## 🎩 Code in STYLE!
**Theme Toggle:**  
Press **Ctrl+Alt+T** to switch between the immersive Stationeers Editor Theme and your previous theme.

---

## ⚙️ Language Server Improvements

- Faster parsing and improved stability  
- Corrected tree-sitter query for `hash_preproc`  
- Updated startup sequence to use async `start()`  
- Safe restart behavior (no “stream destroyed” errors)  
- Inlay hints positioned away from the cursor  
- Expanded logic tokens including:  
  `ReferenceId, BestContactFilter, CelestialHash, EntityState, Apex, VelocityX, VelocityY, VelocityZ, Orientation, Density, TotalQuantity, MinedQuantity, Channel0–7`

---

## 📝 Usage

1. Install the extension.  
2. Open or create a file ending in `.ic10`.  
3. Start typing — language features load automatically.

**Restart the server:**  
Ctrl+Shift+P → “IC10: Restart Server”

**Toggle diagnostics:**  
Ctrl+Alt+D

---

## 🔧 Settings

You can customize behavior using these settings:

| Setting                  | Description                     | Default |
|--------------------------|---------------------------------|---------|
| `ic10.lsp.max_lines`     | Maximum allowed lines           | `128`   |
| `ic10.lsp.max_columns`   | Maximum columns per line        | `90`    |
| `ic10.lsp.max_bytes`     | Maximum total bytes             | `4096`  |
| `ic10.useRemoteLanguageServer` | Use a remote LSP (dev only) | `false` |

---

## 🐞 Issues & Feedback

Report bugs or request features at:  
https://github.com/FlorpyDorp/Stationeers-ic10/issues

---

## ❤️ Credits

This project builds on the work of:

- Anexgohan — earlier IC10 extension foundations  
- Xandaros — original `ic10lsp` language server  
- awilliamson — the first IC10 VS Code IC10 extension  
- IC10 community contributors for instruction documentation, prefab mapping, and testing
