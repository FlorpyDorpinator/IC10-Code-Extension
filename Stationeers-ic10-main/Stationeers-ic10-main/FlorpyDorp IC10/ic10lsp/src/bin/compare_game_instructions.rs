use std::collections::BTreeSet;
use std::env;
use std::fs;

// Naive scanner that extracts instruction keys referenced by ProgrammableChip.cs
// - Localization.GetInterface("ScriptCommandX") -> x.lowercase()
// - GameStrings.ScriptDescriptionX.DisplayString -> x.lowercase()
// Then compares with server INSTRUCTIONS keys.
fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!(
            "Usage: compare_game_instructions <path-to-ProgrammableChip.cs>\n\nExample: compare_game_instructions C:/decomp/Assets/Scripts/Objects/Electrical/ProgrammableChip.cs"
        );
        std::process::exit(2);
    }

    let path = &args[1];
    let content = fs::read_to_string(path).expect("failed to read file");

    let mut game_keys: BTreeSet<String> = BTreeSet::new();

    // Scan for Localization keys
    let mut idx = 0usize;
    let bytes = content.as_bytes();
    while let Some(pos) = content[idx..].find("Localization.GetInterface(") {
        let start = idx + pos;
        let quote_start = content[start..].find('"').map(|p| start + p);
        if let Some(qs) = quote_start {
            let rest = &content[qs + 1..];
            if let Some(qe) = rest.find('"') {
                let key = &rest[..qe];
                if key.starts_with("ScriptCommand") {
                    let suffix = key.trim_start_matches("ScriptCommand");
                    game_keys.insert(suffix.to_ascii_lowercase());
                }
                idx = qs + 1 + qe + 1;
                continue;
            }
        }
        idx = start + 1;
    }

    // Scan for GameStrings.ScriptDescriptionX.DisplayString
    let mut start_at = 0usize;
    while let Some(pos) = content[start_at..].find("GameStrings.ScriptDescription") {
        let start = start_at + pos + "GameStrings.ScriptDescription".len();
        // collect following identifier chars [A-Za-z0-9]
        let mut end = start;
        let chars: Vec<char> = content.chars().collect();
        while end < chars.len() {
            let c = chars[end];
            if c.is_ascii_alphanumeric() { end += 1; } else { break; }
        }
        let ident: String = chars[start..end].iter().collect();
        if !ident.is_empty() {
            game_keys.insert(ident.to_ascii_lowercase());
        }
        start_at = end + 1;
    }

    // Compare with server instruction set
    let server_keys: BTreeSet<String> = ic10lsp::instructions::INSTRUCTIONS
        .keys()
        .map(|k| k.to_string())
        .collect();

    let missing_in_server: Vec<_> = game_keys.difference(&server_keys).cloned().collect();
    let extra_in_server: Vec<_> = server_keys.difference(&game_keys).cloned().collect();

    println!("Game referenced instructions: {}", game_keys.len());
    println!("Server instructions: {}", server_keys.len());

    if missing_in_server.is_empty() {
        println!("\nAll game-referenced instructions are present in server set.");
    } else {
        println!("\nMissing in server (from game):");
        for k in missing_in_server { println!("  - {}", k); }
    }

    if extra_in_server.is_empty() {
        println!("\nNo server-only instructions.");
    } else {
        println!("\nPresent only in server (not found in game scan):");
        for k in extra_in_server { println!("  - {}", k); }
    }
}
