"""
Generate device_hashes.rs from Stationpedia.json
"""
import json
import os

# Read Stationpedia.json
stationpedia_path = r"c:\Users\marka\Desktop\VS IC10 Extension Repo\data\Stationpedia.json"
output_path = r"c:\Users\marka\Desktop\VS IC10 Extension Repo\Stationeers-ic10-main\FlorpyDorp IC10\ic10lsp\src\device_hashes.rs"

print("Loading Stationpedia.json...")
with open(stationpedia_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Extract all items with PrefabName and PrefabHash
device_map = {}  # PrefabName -> (hash, display_name)
hash_to_name = {}  # hash -> display_name

for page in data['pages']:
    prefab_name = page.get('PrefabName')
    prefab_hash = page.get('PrefabHash')
    title = page.get('Title', '')
    
    if prefab_name and prefab_hash is not None:
        # Clean up title (remove HTML tags and localization markers)
        display_name = title.replace('<N:EN:', '').replace('>', '').strip()
        if not display_name:
            display_name = prefab_name
        
        device_map[prefab_name] = (prefab_hash, display_name)
        hash_to_name[prefab_hash] = display_name

print(f"Found {len(device_map)} devices")

# Generate the Rust file
rust_code = """// Device name to hash mapping for HASH() function tooltip support
// Auto-generated from Stationpedia.json

use phf::phf_map;

pub static DEVICE_NAME_TO_HASH: phf::Map<&'static str, i32> = phf_map! {
"""

# Sort by prefab name for consistency
for prefab_name in sorted(device_map.keys()):
    hash_value, _ = device_map[prefab_name]
    rust_code += f'    "{prefab_name}" => {hash_value},\n'

rust_code += """};

pub static HASH_TO_DISPLAY_NAME: phf::Map<i32, &'static str> = phf_map! {
"""

# Sort by hash for consistency
for hash_value in sorted(hash_to_name.keys()):
    display_name = hash_to_name[hash_value]
    # Escape quotes in display name
    display_name = display_name.replace('\\', '\\\\').replace('"', '\\"')
    rust_code += f'    {hash_value} => "{display_name}",\n'

rust_code += """};
"""

# Write the file
print(f"Writing to {output_path}...")
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(rust_code)

print("✅ Done! Device hashes updated.")
print(f"   - {len(device_map)} device names mapped")
print(f"   - {len(hash_to_name)} hash values mapped")
