import os
import json

locales_dir = r"d:\project\ARK-ASA-SERVER-MANAGER-2.0-main\src\i18n\locales"
files = [f for f in os.listdir(locales_dir) if f.endswith('.json')]

def get_keys(data, prefix=""):
    keys = {}
    if isinstance(data, dict):
        for k, v in data.items():
            full_key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                keys.update(get_keys(v, full_key))
            else:
                keys[full_key] = v
    return keys

# Load all languages
langs = {}
for f in files:
    path = os.path.join(locales_dir, f)
    with open(path, 'r', encoding='utf-8') as file:
        try:
            langs[f.replace('.json', '')] = get_keys(json.load(file))
            print(f"Loaded {f} successfully with {len(langs[f.replace('.json', '')])} keys.")
        except Exception as e:
            print(f"Error reading {f}: {e}")

# Compare with English ('en')
if 'en' in langs:
    en_keys = set(langs['en'].keys())
    for lang, keys in langs.items():
        if lang == 'en':
            continue
        missing = en_keys - set(keys.keys())
        extra = set(keys.keys()) - en_keys
        print(f"\n--- {lang} ---")
        print(f"Total keys: {len(keys)}")
        print(f"Missing from English: {len(missing)}")
        print(f"Extra keys not in English: {len(extra)}")
        if missing:
            print(f"Sample missing keys (first 10): {list(missing)[:10]}")
        if extra:
            print(f"Sample extra keys (first 10): {list(extra)[:10]}")
