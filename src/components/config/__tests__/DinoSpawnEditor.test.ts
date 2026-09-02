import { describe, it, expect } from 'vitest';
import { parseReplacements, stringifyReplacements } from '../DinoSpawnEditor';
import { parseIniContent, generateIniContent, CaseInsensitiveMap } from '../../../data/configMappings';

describe('DinoSpawnEditor - NPCReplacements Serialization and Parsing', () => {
    it('should parse clean struct format (FromClassName="Titanosaur_Character_BP_C",ToClassName="")', () => {
        const raw = '(FromClassName="Titanosaur_Character_BP_C",ToClassName="")';
        const parsed = parseReplacements(raw);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].FromClassName).toBe('Titanosaur_Character_BP_C');
        expect(parsed[0].ToClassName).toBe('');
    });

    it('should parse single-prefixed format NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")', () => {
        const raw = 'NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")';
        const parsed = parseReplacements(raw);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].FromClassName).toBe('Titanosaur_Character_BP_C');
        expect(parsed[0].ToClassName).toBe('');
    });

    it('should parse double-prefixed replica format NPCReplacements=NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")', () => {
        const raw = 'NPCReplacements=NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")';
        const parsed = parseReplacements(raw);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].FromClassName).toBe('Titanosaur_Character_BP_C');
        expect(parsed[0].ToClassName).toBe('');
    });

    it('should stringify replacements without key prefix to avoid double NPCReplacements= when serialized', () => {
        const replacements = [
            { FromClassName: 'Titanosaur_Character_BP_C', ToClassName: '' },
            { FromClassName: 'Raptor_Character_BP_C', ToClassName: 'Rex_Character_BP_C' },
        ];

        const stringified = stringifyReplacements(replacements);
        expect(stringified).toBe(
            '(FromClassName="Titanosaur_Character_BP_C",ToClassName="")\n(FromClassName="Raptor_Character_BP_C",ToClassName="Rex_Character_BP_C")'
        );
        expect(stringified).not.toContain('NPCReplacements=');
    });

    it('should correctly generate INI with single key prefix when integrated with generateIniContent', () => {
        const replacements = [
            { FromClassName: 'Titanosaur_Character_BP_C', ToClassName: '' },
        ];
        const value = stringifyReplacements(replacements);

        const sections = new CaseInsensitiveMap<CaseInsensitiveMap<string>>();
        const gameSection = new CaseInsensitiveMap<string>();
        gameSection.set('NPCReplacements', value);
        sections.set('/Script/ShooterGame.ShooterGameMode', gameSection);

        const iniOutput = generateIniContent(sections);
        expect(iniOutput).toContain('NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")');
        expect(iniOutput).not.toContain('NPCReplacements=NPCReplacements=');
    });

    it('should roundtrip parse and generate correctly without duplicating prefix', () => {
        const initialIni = `[/Script/ShooterGame.ShooterGameMode]
NPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")
`;
        const parsedIni = parseIniContent(initialIni);
        const section = parsedIni.get('/Script/ShooterGame.ShooterGameMode');
        expect(section).toBeDefined();

        const rawVal = section?.get('NPCReplacements') || '';
        const reps = parseReplacements(rawVal);
        expect(reps).toEqual([{ FromClassName: 'Titanosaur_Character_BP_C', ToClassName: '' }]);

        const updatedVal = stringifyReplacements(reps);
        section?.set('NPCReplacements', updatedVal);

        const generated = generateIniContent(parsedIni);
        expect(generated.trim()).toBe(
            '[/Script/ShooterGame.ShooterGameMode]\nNPCReplacements=(FromClassName="Titanosaur_Character_BP_C",ToClassName="")'
        );
    });
});
