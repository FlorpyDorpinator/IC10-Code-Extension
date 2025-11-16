/**
 * Generate device_hashes.rs from Stationpedia.json
 */
const fs = require('fs');
const path = require('path');

// Paths
const stationpediaPath = path.join(__dirname, '..', 'data', 'Stationpedia.json');
const outputPath = path.join(__dirname, '..', 'Stationeers-ic10-main', 'FlorpyDorp IC10', 'ic10lsp', 'src', 'device_hashes.rs');

console.log('Loading Stationpedia.json...');
const data = JSON.parse(fs.readFileSync(stationpediaPath, 'utf8'));

// Extract all items with PrefabName and PrefabHash
const deviceMap = new Map(); // PrefabName -> {hash, displayName}
const hashToName = new Map(); // hash -> displayName

for (const page of data.pages) {
    const prefabName = page.PrefabName;
    const prefabHash = page.PrefabHash;
    let title = page.Title || '';
    
    if (prefabName && prefabHash !== null && prefabHash !== undefined) {
        // Clean up title (remove HTML tags and localization markers)
        let displayName = title.replace(/<N:EN:/g, '').replace(/>/g, '').trim();
        if (!displayName) {
            displayName = prefabName;
        }
        
        deviceMap.set(prefabName, { hash: prefabHash, displayName });
        hashToName.set(prefabHash, displayName);
    }
}

console.log(`Found ${deviceMap.size} devices`);

// Generate the Rust file
let rustCode = `// Device name to hash mapping for HASH() function tooltip support
// Auto-generated from Stationpedia.json

use phf::phf_map;

pub static DEVICE_NAME_TO_HASH: phf::Map<&'static str, i32> = phf_map! {
`;

// Sort by prefab name for consistency
const sortedPrefabs = Array.from(deviceMap.keys()).sort();
for (const prefabName of sortedPrefabs) {
    const { hash } = deviceMap.get(prefabName);
    rustCode += `    "${prefabName}" => ${hash},\n`;
}

rustCode += `};

pub static HASH_TO_DISPLAY_NAME: phf::Map<i32, &'static str> = phf_map! {
`;

// Sort by hash for consistency
const sortedHashes = Array.from(hashToName.keys()).sort((a, b) => a - b);
for (const hashValue of sortedHashes) {
    const displayName = hashToName.get(hashValue);
    // Escape quotes and backslashes in display name
    const escapedName = displayName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // Use i32 suffix for all hash values
    rustCode += `    ${hashValue}i32 => "${escapedName}",\n`;
}

rustCode += `};
`;

// Write the file
console.log(`Writing to ${outputPath}...`);
fs.writeFileSync(outputPath, rustCode, 'utf8');

console.log('✅ Done! Device hashes updated.');
console.log(`   - ${deviceMap.size} device names mapped`);
console.log(`   - ${hashToName.size} hash values mapped`);
