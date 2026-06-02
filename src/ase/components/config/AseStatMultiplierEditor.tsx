import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, Zap, Moon, Wind, Apple, Droplet, Thermometer, Scale, Swords, Gauge, Shield, Wrench,
  ChevronDown, RotateCcw, Sliders, CheckSquare, Sparkles, User, Settings
} from 'lucide-react';
import { AseGameConfig } from '../../types/ase.types';
import { cn } from '../../../utils/helpers';

interface AseStatMultiplierEditorProps {
  config: AseGameConfig;
  onChange: (updatedConfig: AseGameConfig) => void;
}

interface StatDef {
  index: number;
  label: string;
  icon: React.ReactNode;
  step?: number;
  min?: number;
  max?: number;
  isLevels?: boolean;
}

const STAT_DEFINITIONS: StatDef[] = [
  { index: 0, label: 'Health', icon: <Heart className="w-4 h-4 text-rose-500" />, step: 0.1, min: 0 },
  { index: 1, label: 'Stamina', icon: <Zap className="w-4 h-4 text-amber-500" />, step: 0.1, min: 0 },
  { index: 2, label: 'Torpidity', icon: <Moon className="w-4 h-4 text-cyan-500" />, step: 0.1, min: 0 },
  { index: 3, label: 'Oxygen', icon: <Wind className="w-4 h-4 text-sky-400" />, step: 0.1, min: 0 },
  { index: 4, label: 'Food', icon: <Apple className="w-4 h-4 text-emerald-500" />, step: 0.1, min: 0 },
  { index: 5, label: 'Water', icon: <Droplet className="w-4 h-4 text-blue-500" />, step: 0.1, min: 0 },
  { index: 6, label: 'Temperature', icon: <Thermometer className="w-4 h-4 text-red-400" />, step: 0.1, min: 0 },
  { index: 7, label: 'Weight', icon: <Scale className="w-4 h-4 text-stone-400" />, step: 0.1, min: 0 },
  { index: 8, label: 'Damage', icon: <Swords className="w-4 h-4 text-red-500" />, step: 0.1, min: 0 },
  { index: 9, label: 'Speed', icon: <Gauge className="w-4 h-4 text-teal-400" />, step: 0.1, min: 0 },
  { index: 10, label: 'Fortitude', icon: <Shield className="w-4 h-4 text-emerald-400" />, step: 0.1, min: 0 },
  { index: 11, label: 'Crafting', icon: <Wrench className="w-4 h-4 text-orange-400" />, step: 0.1, min: 0 }
];

export const AseStatMultiplierEditor: React.FC<AseStatMultiplierEditorProps> = memo(({ config, onChange }) => {
  // Collapsible sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    playerBase: true,
    playerPerLevel: true,
    wildPerLevel: false,
    wildMutagen: false,
    tamedPerLevel: true,
    tamedAdd: false,
    tamedAffinity: false,
    tamedMutagen: false
  });

  // Enable/Disable sections state (checkboxes like ASM)
  const [enabledSections, setEnabledSections] = useState<Record<string, boolean>>({
    playerBase: true,
    playerPerLevel: true,
    wildPerLevel: false,
    wildMutagen: false,
    tamedPerLevel: true,
    tamedAdd: false,
    tamedAffinity: false,
    tamedMutagen: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleEnabled = (section: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEnabledSections(prev => {
      const updated = { ...prev, [section]: !prev[section] };
      // If we enable it, also make sure it collapses open
      if (updated[section]) {
        setOpenSections(open => ({ ...open, [section]: true }));
      }
      return updated;
    });
  };

  const handleArrayChange = (
    key: keyof AseGameConfig,
    index: number,
    value: number
  ) => {
    const currentArray = [...((config[key] as number[]) || Array(12).fill(1.0))];
    currentArray[index] = value;
    onChange({
      ...config,
      [key]: currentArray
    });
  };

  const resetArray = (key: keyof AseGameConfig, defaultValues: number[]) => {
    onChange({
      ...config,
      [key]: [...defaultValues]
    });
  };

  const renderSectionHeader = (
    id: string,
    title: string,
    onReset: () => void
  ) => {
    const isOpen = openSections[id];
    const isEnabled = enabledSections[id];

    return (
      <div 
        onClick={() => toggleSection(id)}
        className={cn(
          "flex items-center justify-between p-4 bg-slate-900/60 border border-white/5 rounded-2xl cursor-pointer transition-all duration-300 select-none",
          isOpen ? "rounded-b-none border-b-0 border-amber-500/20" : "",
          isEnabled ? "hover:border-amber-500/30" : "opacity-60"
        )}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => toggleEnabled(id, e)}
            className={cn(
              "w-5 h-5 rounded border flex items-center justify-center transition-all duration-200",
              isEnabled 
                ? "bg-amber-500 border-amber-500 text-slate-950 shadow-md shadow-amber-500/25" 
                : "border-white/20 hover:border-white/40"
            )}
          >
            {isEnabled && <CheckSquare className="w-4 h-4" />}
          </button>
          <span className="font-bold text-white tracking-wide text-sm sm:text-base">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          {isEnabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-amber-400 rounded-lg transition-all"
              title="Reset defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <ChevronDown 
            className={cn(
              "w-5 h-5 text-slate-400 transition-transform duration-300",
              isOpen ? "rotate-180 text-amber-400" : ""
            )} 
          />
        </div>
      </div>
    );
  };

  const renderSliders = (
    key: keyof AseGameConfig,
    id: string,
    isMutagen = false
  ) => {
    const values = (config[key] as number[]) || Array(12).fill(isMutagen ? 0 : 1.0);
    const isOpen = openSections[id];
    const isEnabled = enabledSections[id];

    return (
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={cn(
              "p-5 bg-slate-950/40 border border-t-0 border-white/5 rounded-b-2xl grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 transition-all duration-300",
              !isEnabled ? "pointer-events-none opacity-40" : ""
            )}>
              {STAT_DEFINITIONS.map(stat => {
                const value = values[stat.index] !== undefined ? values[stat.index] : (isMutagen ? 0 : 1.0);
                const step = isMutagen ? 1 : (stat.step || 0.1);
                const min = isMutagen ? 0 : (stat.min !== undefined ? stat.min : 0);
                const max = isMutagen ? 100 : (stat.max !== undefined ? stat.max : 100);

                return (
                  <div key={stat.index} className="flex items-center gap-4 py-2 group/slider">
                    <div className="flex items-center gap-2.5 w-32 shrink-0">
                      {stat.icon}
                      <span className="text-sm font-semibold text-slate-300 group-hover/slider:text-white transition-colors">{stat.label}:</span>
                    </div>

                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(e) => handleArrayChange(key, stat.index, parseFloat(e.target.value))}
                        className="w-full accent-amber-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all duration-300 group-hover/slider:bg-slate-700"
                      />
                      
                      <div className="w-20 flex items-center gap-1.5 bg-slate-950/60 border border-white/5 rounded-lg px-2 py-1 group-focus-within/slider:border-amber-500/50">
                        <input
                          type="number"
                          step={step}
                          value={value}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleArrayChange(key, stat.index, val);
                            }
                          }}
                          className="w-full bg-transparent text-white font-mono text-xs focus:outline-none text-right"
                        />
                        <span className="text-[10px] font-bold text-slate-500 shrink-0 select-none">
                          {isMutagen ? 'L' : 'x'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="space-y-8">
      {/* Introduction Card */}
      <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl shrink-0">
            <Sliders className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              Stat Multipliers Configuration
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Define the growth rate, base amounts, and breeding mutagen boosts for both players and creatures.
              Toggle the checkboxes to enable and expand each category, mirroring the classic ARK Server Manager layout.
            </p>
          </div>
        </div>
      </div>

      {/* 1. PLAYER STAT MULTIPLIERS */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <User className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-extrabold text-white tracking-wider uppercase">Player Settings</h2>
        </div>

        <div className="space-y-4 bg-slate-900/20 p-4 rounded-3xl border border-white/5">
          {/* Base Stat Multipliers */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'playerBase',
              'Base Stat Multipliers',
              () => resetArray('playerBaseStatMultipliers', Array(12).fill(1.0))
            )}
            {renderSliders(
              'playerBaseStatMultipliers',
              'playerBase',
              false
            )}
          </div>

          {/* Per-Level Stat Multipliers */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'playerPerLevel',
              'Per-Level Stat Multipliers',
              () => resetArray('perLevelStatsMultiplierPlayer', Array(12).fill(1.0))
            )}
            {renderSliders(
              'perLevelStatsMultiplierPlayer',
              'playerPerLevel',
              false
            )}
          </div>
        </div>
      </div>

      {/* 2. WILD DINO MULTIPLIERS */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h2 className="text-base font-extrabold text-white tracking-wider uppercase">Wild Dino Settings</h2>
        </div>

        <div className="space-y-4 bg-slate-900/20 p-4 rounded-3xl border border-white/5">
          {/* Per-Level Stat Multipliers (Wild) */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'wildPerLevel',
              'Per-Level Stat Multipliers (Wild)',
              () => resetArray('perLevelStatsMultiplierDinoWild', Array(12).fill(1.0))
            )}
            {renderSliders(
              'perLevelStatsMultiplierDinoWild',
              'wildPerLevel',
              false
            )}
          </div>

          {/* Mutagen Level Boost (Wild) */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'wildMutagen',
              'Mutagen Level Boost (Wild)',
              () => {
                const def = Array(12).fill(0);
                def[0] = 5; def[1] = 5; def[7] = 5; def[8] = 5;
                resetArray('mutagenLevelBoostArray', def);
              }
            )}
            {renderSliders(
              'mutagenLevelBoostArray',
              'wildMutagen',
              true
            )}
          </div>
        </div>
      </div>

      {/* 3. TAMED DINO MULTIPLIERS */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <Settings className="w-5 h-5 text-cyan-500" />
          <h2 className="text-base font-extrabold text-white tracking-wider uppercase">Tamed Dino Settings</h2>
        </div>

        <div className="space-y-4 bg-slate-900/20 p-4 rounded-3xl border border-white/5">
          {/* Per-Level Stat Multipliers (Tamed) */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'tamedPerLevel',
              'Per-Level Stat Multipliers (Tamed)',
              () => {
                const def = Array(12).fill(1.0);
                def[0] = 0.2; def[8] = 0.17;
                resetArray('perLevelStatsMultiplierDinoTamed', def);
              }
            )}
            {renderSliders(
              'perLevelStatsMultiplierDinoTamed',
              'tamedPerLevel',
              false
            )}
          </div>

          {/* Per-Level Stat Multipliers (Tamed) - Add */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'tamedAdd',
              'Per-Level Stat Multipliers (Tamed) - Add',
              () => {
                const def = Array(12).fill(1.0);
                def[0] = 0.14; def[8] = 0.14;
                resetArray('perLevelStatsMultiplierDinoTamedAdd', def);
              }
            )}
            {renderSliders(
              'perLevelStatsMultiplierDinoTamedAdd',
              'tamedAdd',
              false
            )}
          </div>

          {/* Per-Level Stat Multipliers (Tamed) - Affinity */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'tamedAffinity',
              'Per-Level Stat Multipliers (Tamed) - Affinity',
              () => {
                const def = Array(12).fill(1.0);
                def[0] = 0.44; def[8] = 0.44;
                resetArray('perLevelStatsMultiplierDinoTamedAffinity', def);
              }
            )}
            {renderSliders(
              'perLevelStatsMultiplierDinoTamedAffinity',
              'tamedAffinity',
              false
            )}
          </div>

          {/* Mutagen Level Boost (Bred) */}
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {renderSectionHeader(
              'tamedMutagen',
              'Mutagen Level Boost (Bred)',
              () => {
                const def = Array(12).fill(0);
                def[0] = 1; def[1] = 1; def[7] = 1; def[8] = 1;
                resetArray('mutagenLevelBoostBredArray', def);
              }
            )}
            {renderSliders(
              'mutagenLevelBoostBredArray',
              'tamedMutagen',
              true
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

AseStatMultiplierEditor.displayName = 'AseStatMultiplierEditor';
