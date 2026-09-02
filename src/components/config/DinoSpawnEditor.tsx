import { useMemo } from 'react';
import { Plus, Trash2, ShieldAlert, ArrowRight, Dna } from 'lucide-react';
import { VANILLA_CREATURES } from '../../ase/data/creatures';

interface DinoSpawnEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface NPCReplacement {
  FromClassName: string;
  ToClassName: string;
}

export const parseReplacements = (val: string): NPCReplacement[] => {
  if (!val) return [];
  const lines = val.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const fromMatch = line.match(/FromClassName="([^"]+)"/);
    const toMatch = line.match(/ToClassName="([^"]*)"/);
    if (fromMatch) {
      return { FromClassName: fromMatch[1], ToClassName: toMatch ? toMatch[1] : '' };
    }
    return null;
  }).filter((r): r is NPCReplacement => r !== null);
};

export const stringifyReplacements = (replacements: NPCReplacement[]): string => {
  return replacements.map(r => `(FromClassName="${r.FromClassName}",ToClassName="${r.ToClassName}")`).join('\n');
};

export function DinoSpawnEditor({ value, onChange }: DinoSpawnEditorProps) {
  const replacements = useMemo(() => parseReplacements(value), [value]);

  const updateReplacement = (idx: number, newRep: NPCReplacement) => {
    const newReps = [...replacements];
    newReps[idx] = newRep;
    onChange(stringifyReplacements(newReps));
  };

  const removeReplacement = (idx: number) => {
    const newReps = [...replacements];
    newReps.splice(idx, 1);
    onChange(stringifyReplacements(newReps));
  };

  const addReplacement = () => {
    onChange(stringifyReplacements([...replacements, { FromClassName: 'Dodo_Character_BP_C', ToClassName: '' }]));
  };

  const sortedCreatures = useMemo(() => {
    return [...VANILLA_CREATURES].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg border border-gray-700">
        <div>
          <h3 className="font-medium text-white flex items-center">
            <Dna className="w-5 h-5 mr-2 text-primary-400" />
            Dino Spawn Replacements
          </h3>
          <p className="text-sm text-gray-400">Replace one type of dinosaur with another, or remove it entirely.</p>
        </div>
        <button
          onClick={addReplacement}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded flex items-center text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Replacement
        </button>
      </div>

      <div className="space-y-3">
        {replacements.map((rep, idx) => (
          <div key={idx} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row items-center gap-4 relative">
            <button
              onClick={() => removeReplacement(idx)}
              className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors md:relative md:top-0 md:right-0 md:ml-auto"
              title="Remove override"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            <div className="w-full md:flex-1 space-y-1">
              <label className="block text-xs font-medium text-gray-400">Replace (Original Creature)</label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                value={rep.FromClassName}
                onChange={(e) => updateReplacement(idx, { ...rep, FromClassName: e.target.value })}
              >
                <option value="">Select a creature...</option>
                {sortedCreatures.map(c => (
                  <option key={c.className + '-from'} value={c.className}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div className="hidden md:flex items-center justify-center pt-5">
              <ArrowRight className="w-5 h-5 text-gray-500" />
            </div>

            <div className="w-full md:flex-1 space-y-1">
              <label className="block text-xs font-medium text-gray-400">With (Replacement Creature)</label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                value={rep.ToClassName}
                onChange={(e) => updateReplacement(idx, { ...rep, ToClassName: e.target.value })}
              >
                <option value="">[ Remove Entirely ]</option>
                {sortedCreatures.map(c => (
                  <option key={c.className + '-to'} value={c.className}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {replacements.length === 0 && (
          <div className="text-center py-8 bg-gray-800/50 border border-gray-700 border-dashed rounded-lg">
            <ShieldAlert className="w-8 h-8 mx-auto text-gray-500 mb-2" />
            <p className="text-gray-400">No dinosaur replacements configured.</p>
            <button
              onClick={addReplacement}
              className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            >
              Add First Replacement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
