import { describe, it, expect } from 'vitest';
import {
    parseIniContent,
    generateIniContent,
    getCanonicalKeyName,
    CaseInsensitiveMap,
    GAME_USER_SETTINGS_SCHEMA,
} from '../configMappings';

describe('Cryopod INI Configuration & Key Aliasing', () => {
    it('should have DisableCryopodFridgeRequirement and AllowCryoFridgeOnSaddle in schema', () => {
        const cryoGroup = GAME_USER_SETTINGS_SCHEMA.find(g => g.title === 'Cryopods & Stasis');
        expect(cryoGroup).toBeDefined();

        const fridgeReqField = cryoGroup?.fields.find(f => f.key === 'DisableCryopodFridgeRequirement');
        expect(fridgeReqField).toBeDefined();
        expect(fridgeReqField?.label).toBe('Disable Cryo Fridge Requirement');

        const saddleField = cryoGroup?.fields.find(f => f.key === 'AllowCryoFridgeOnSaddle');
        expect(saddleField).toBeDefined();

        // Ensure non-functional keys are no longer present as primary fields in the schema
        const legacyStructureField = cryoGroup?.fields.find(f => f.key === 'DisableCryopodStructureRequirement');
        expect(legacyStructureField).toBeUndefined();
    });

    it('should alias legacy DisableCryopodStructureRequirement to DisableCryopodFridgeRequirement', () => {
        const canonicalKey = getCanonicalKeyName('ServerSettings', 'DisableCryopodStructureRequirement');
        expect(canonicalKey).toBe('DisableCryopodFridgeRequirement');
    });

    it('should alias legacy DisableCryopodStasis to DisableCryopodFridgeRequirement', () => {
        const canonicalKey = getCanonicalKeyName('ServerSettings', 'DisableCryopodStasis');
        expect(canonicalKey).toBe('DisableCryopodFridgeRequirement');
    });

    it('should parse official DisableCryopodFridgeRequirement from INI text', () => {
        const iniText = `[ServerSettings]
DisableCryopodFridgeRequirement=True
DisableCryopodEnemyCheck=True
AllowCryoFridgeOnSaddle=True
`;
        const parsed = parseIniContent(iniText);
        const serverSettings = parsed.get('ServerSettings');
        expect(serverSettings).toBeDefined();
        expect(serverSettings?.get('DisableCryopodFridgeRequirement')).toBe('True');
        expect(serverSettings?.get('DisableCryopodEnemyCheck')).toBe('True');
        expect(serverSettings?.get('AllowCryoFridgeOnSaddle')).toBe('True');
    });

    it('should seamlessly upgrade legacy DisableCryopodStructureRequirement when reading INI', () => {
        const iniText = `[ServerSettings]
DisableCryopodStructureRequirement=True
`;
        const parsed = parseIniContent(iniText);
        const serverSettings = parsed.get('ServerSettings');
        expect(serverSettings).toBeDefined();
        // Should be accessible via official key name
        expect(serverSettings?.get('DisableCryopodFridgeRequirement')).toBe('True');
    });

    it('should serialize official DisableCryopodFridgeRequirement and omit legacy keys in generated INI', () => {
        const sections = new CaseInsensitiveMap<CaseInsensitiveMap<string>>();
        const serverSettings = new CaseInsensitiveMap<string>();
        serverSettings.set('DisableCryopodFridgeRequirement', 'True');
        serverSettings.set('DisableCryopodStructureRequirement', 'True'); // obsolete key
        serverSettings.set('AllowCryoFridgeOnSaddle', 'True');
        sections.set('ServerSettings', serverSettings);

        const generated = generateIniContent(sections);
        expect(generated).toContain('DisableCryopodFridgeRequirement=True');
        expect(generated).toContain('AllowCryoFridgeOnSaddle=True');
        expect(generated).not.toContain('DisableCryopodStructureRequirement');
    });
});
