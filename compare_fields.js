import fs from 'fs';
import path from 'path';

const modelsPath = "d:/client Project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/ase/models.rs";
const editorPath = "d:/client Project/ARK-ASA-SERVER-MANAGER-2.0-main/src/ase/pages/ASEConfigEditor.tsx";

// 1. Read and parse models.rs
const modelsContent = fs.readFileSync(modelsPath, 'utf8');

// Match AseGameConfig struct body
const structMatch = modelsContent.match(/pub struct AseGameConfig \{([\s\S]*?)\}/);
if (!structMatch) {
  console.error("Could not find AseGameConfig struct in models.rs");
  process.exit(1);
}

const structBody = structMatch[1];
const rustFields = [];
const lines = structBody.split('\n');

for (let line of lines) {
  line = line.trim();
  if (!line || line.startsWith('//')) continue;
  
  const fieldMatch = line.match(/^pub\s+([a-zA-Z0-9_]+)\s*:\s*([^,]+)/);
  if (fieldMatch) {
    rustFields.push({
      snake: fieldMatch[1],
      type: fieldMatch[2].trim()
    });
  }
}

// 2. Read and parse ASEConfigEditor.tsx
const editorContent = fs.readFileSync(editorPath, 'utf8');

// Parse keys in schema = useMemo(() => [ ... ])
const schemaMatch = editorContent.match(/const schema = useMemo\(\(\) => \[([\s\S]*?)\]/);
const schemaKeys = new Set();
if (schemaMatch) {
  const schemaBody = schemaMatch[1];
  const keys = [...schemaBody.matchAll(/key:\s*['"]([a-zA-Z0-9_]+)['"]/g)].map(m => m[1]);
  for (const k of keys) {
    schemaKeys.add(k);
  }
}

// Parse keys in defaultConfig
const defaultConfigMatch = editorContent.match(/const defaultConfig: AseGameConfig = \{([\s\S]*?)\};/);
const defaultConfigKeys = new Set();
if (defaultConfigMatch) {
  const dcBody = defaultConfigMatch[1];
  const keys = [...dcBody.matchAll(/([a-zA-Z0-9_]+)\s*:/g)].map(m => m[1]);
  for (const k of keys) {
    defaultConfigKeys.add(k);
  }
}

function toCamelCase(snakeStr) {
  const components = snakeStr.split('_');
  if (components[0] === 'b' && components.length > 1) {
    return 'b' + components.slice(1).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
  }
  return components[0] + components.slice(1).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
}

console.log(`Total Rust fields in struct: ${rustFields.length}`);
console.log(`Total schema keys in editor: ${schemaKeys.size}`);

const missing = [];
for (const rf of rustFields) {
  const camel = toCamelCase(rf.snake);
  if (!schemaKeys.has(camel)) {
    missing.push({
      snake: rf.snake,
      camel: camel,
      type: rf.type,
      inDefault: defaultConfigKeys.has(camel) ? "Yes" : "No"
    });
  }
}

console.log("\n--- MISSING IN TSX SCHEMA ARRAY ---");
console.log(JSON.stringify(missing, null, 2));
console.log(`\nTotal missing: ${missing.length}`);
