import re
import json

# Paths
models_path = r"d:\client Project\ARK-ASA-SERVER-MANAGER-2.0-main\src-tauri\src\ase\models.rs"
editor_path = r"d:\client Project\ARK-ASA-SERVER-MANAGER-2.0-main\src\ase\pages\ASEConfigEditor.tsx"

# 1. Parse models.rs to find all fields in AseGameConfig struct
with open(models_path, 'r', encoding='utf-8') as f:
    models_content = f.read()

# Extract struct AseGameConfig fields
struct_match = re.search(r'pub struct AseGameConfig \{(.*?)\}', models_content, re.DOTALL)
rust_fields = []
if struct_match:
    struct_body = struct_match.group(1)
    # Parse lines like "pub field_name: type,"
    for line in struct_body.split('\n'):
        line = line.strip()
        if not line or line.startswith('//'):
            continue
        field_match = re.match(r'pub\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),', line)
        if field_match:
            field_name = field_match.group(1)
            field_type = field_match.group(2)
            rust_fields.append((field_name, field_type))

# 2. Parse ASEConfigEditor.tsx to find all keys declared in the schema array
with open(editor_path, 'r', encoding='utf-8') as f:
    editor_content = f.read()

# Find the schema definition body
schema_match = re.search(r'const schema = useMemo\(\(\) => \[(.*?)\]', editor_content, re.DOTALL)
schema_keys = set()
if schema_match:
    schema_body = schema_match.group(1)
    # Match patterns like "key: 'sessionName'" or 'key: "sessionName"'
    keys = re.findall(r'key:\s*[\'"]([a-zA-Z0-9_]+)[\'"]', schema_body)
    for k in keys:
        schema_keys.add(k)

# Add keys defined in defaultConfig but maybe not in schema, let's also find all keys in defaultConfig
default_config_match = re.search(r'const defaultConfig: AseGameConfig = \{(.*?)\};', editor_content, re.DOTALL)
default_config_keys = set()
if default_config_match:
    dc_body = default_config_match.group(1)
    # Match property names
    dc_keys = re.findall(r'([a-zA-Z0-9_]+)\s*:', dc_body)
    for k in dc_keys:
        default_config_keys.add(k)

# Convert Rust snake_case to camelCase
def to_camel_case(snake_str):
    components = snake_str.split('_')
    # If it starts with b_ (e.g. b_allow_flying_stamina_recovery -> bAllowFlyingStaminaRecovery)
    if components[0] == 'b' and len(components) > 1:
        return 'b' + ''.join(x.title() for x in components[1:])
    return components[0] + ''.join(x.title() for x in components[1:])

print(f"Total Rust fields in struct: {len(rust_fields)}")
print(f"Total schema keys in editor: {len(schema_keys)}")

missing_in_schema = []
for rf, rf_type in rust_fields:
    cc_name = to_camel_case(rf)
    if cc_name not in schema_keys:
        missing_in_schema.append((rf, cc_name, rf_type))

print("\n--- MISSING IN SCHEMA ARRAY (But present in Rust backend) ---")
for snake, camel, f_type in missing_in_schema:
    in_default = "Yes" if camel in default_config_keys else "No"
    print(f"Rust: {snake:50} | Camel: {camel:50} | Type: {f_type:15} | In DefaultConfig: {in_default}")

print("\n--- Summary of missing fields ---")
print(f"Total missing from visual editor schema: {len(missing_in_schema)}")
