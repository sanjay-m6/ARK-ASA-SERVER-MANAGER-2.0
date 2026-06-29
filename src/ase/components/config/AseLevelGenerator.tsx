import React, { useState, useEffect, useMemo } from 'react';
import { Flame, Info, Check, TrendingUp, Table, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { AseGameConfig } from '../../types/ase.types';
import { toast } from 'react-hot-toast';
import { cn } from '../../../utils/helpers';

interface AseLevelGeneratorProps {
  config: AseGameConfig;
  onChange: (updatedConfig: AseGameConfig) => void;
}

type GeneratorTarget = 'player' | 'dino';

interface GeneratorSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  isFloat?: boolean;
}

const GeneratorSlider: React.FC<GeneratorSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  isFloat = false
}) => {
  const [localValue, setLocalValue] = useState(String(value));

  // Sync state with outer changes
  useEffect(() => {
    setLocalValue(isFloat ? value.toFixed(2) : String(value));
  }, [value, isFloat]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setLocalValue(rawVal);

    const parsed = isFloat ? parseFloat(rawVal) : parseInt(rawVal, 10);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    const parsed = isFloat ? parseFloat(localValue) : parseInt(localValue, 10);
    if (isNaN(parsed)) {
      setLocalValue(isFloat ? value.toFixed(2) : String(value));
    } else {
      setLocalValue(isFloat ? parsed.toFixed(2) : String(parsed));
    }
  };

  const fillPercentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-350">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            onChange(val);
            setLocalValue(isFloat ? val.toFixed(2) : String(val));
          }}
          className="w-full accent-amber-500 h-1.5 rounded-full appearance-none cursor-pointer focus:outline-none transition-all duration-300"
          style={{
            background: `linear-gradient(to right, hsl(var(--accent-hue, 45) 80% 50%) 0%, hsl(var(--accent-hue, 45) 80% 50%) ${fillPercentage}%, rgba(255,255,255,0.05) ${fillPercentage}%, rgba(255,255,255,0.05) 100%)`,
          }}
        />
        <input
          type="text"
          value={localValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          className="w-16 bg-[#0a0f1d]/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center font-mono transition-all focus:outline-none focus:border-amber-500/50 hover:border-white/20"
        />
      </div>
    </div>
  );
};

export function AseLevelGenerator({ config, onChange }: AseLevelGeneratorProps) {
  const [target, setTarget] = useState<GeneratorTarget>('player');
  const [maxLevel, setMaxLevel] = useState<number>(105);
  const [baseXp, setBaseXp] = useState<number>(10);
  const [exponent, setExponent] = useState<number>(2.2);

  // Wild Dino Max Level state
  const [wildDinoLevel, setWildDinoLevel] = useState<number>(150);

  // Pagination for XP Table
  const [page, setPage] = useState<number>(0);
  const itemsPerPage = 6;

  // Parse current ramps from config to initialize values
  useEffect(() => {
    const lines = (config.levelExperienceRampOverrides || '').split('\n').map(l => l.trim()).filter(Boolean);
    const currentRamp = target === 'player' ? lines[0] : lines[1];
    
    if (currentRamp) {
      // Try to determine max level from existing ramp
      const matches = [...currentRamp.matchAll(/ExperiencePointsForLevel\[(\d+)\]/g)];
      if (matches.length > 0) {
        const indices = matches.map(m => parseInt(m[1]));
        const detectedMaxLevel = Math.max(...indices) + 1;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMaxLevel(detectedMaxLevel);
      }
    } else {
      // Default presets if no ramp exists
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMaxLevel(target === 'player' ? 105 : 88);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [target, config.levelExperienceRampOverrides]);

  // Compute XP data list dynamically
  const xpData = useMemo(() => {
    const data = [];
    let totalXp = 0;
    for (let i = 0; i < maxLevel; i++) {
      const xpNeeded = Math.floor(baseXp * Math.pow(i, exponent));
      totalXp += xpNeeded;
      data.push({ level: i + 1, xpNeeded, totalXp });
    }
    return data;
  }, [maxLevel, baseXp, exponent]);

  // SVG Path generation for XP Curve
  const svgPath = useMemo(() => {
    if (xpData.length < 2) return '';
    const width = 320;
    const height = 120;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxTotalXp = xpData[xpData.length - 1].totalXp || 1;
    const points = xpData.map((d, index) => {
      const x = padding + (index / (xpData.length - 1)) * chartWidth;
      const y = padding + chartHeight - (d.totalXp / maxTotalXp) * chartHeight;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }, [xpData]);

  // SVG Fill Path (closed area for gradient fill)
  const svgFillPath = useMemo(() => {
    if (xpData.length < 2) return '';
    const width = 320;
    const height = 120;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxTotalXp = xpData[xpData.length - 1].totalXp || 1;
    const points = xpData.map((d, index) => {
      const x = padding + (index / (xpData.length - 1)) * chartWidth;
      const y = padding + chartHeight - (d.totalXp / maxTotalXp) * chartHeight;
      return `${x},${y}`;
    });

    const startX = padding;
    const startY = height - padding;
    const endX = padding + chartWidth;

    return `M ${startX},${startY} L ${points.join(' L ')} L ${endX},${startY} Z`;
  }, [xpData]);

  const handleApplyXpRamp = () => {
    // Generate XP ramp string
    const levels = xpData.map((d, i) => `ExperiencePointsForLevel[${i}]=${d.xpNeeded}`);
    const rampString = `(${levels.join(',')})`;

    const currentRamps = (config.levelExperienceRampOverrides || '').split('\n').map(l => l.trim()).filter(Boolean);
    
    let newPlayerRamp = currentRamps[0] || '';
    let newDinoRamp = currentRamps[1] || '';

    const maxExperience = xpData[xpData.length - 1].totalXp.toString();

    const updatedConfig = { ...config };

    if (target === 'player') {
      newPlayerRamp = rampString;
      updatedConfig.overrideMaxExperiencePointsPlayer = maxExperience;
    } else {
      newDinoRamp = rampString;
      updatedConfig.overrideMaxExperiencePointsDino = maxExperience;

      // If we are setting dino ramp but player ramp is empty, we must generate a default player ramp 
      // or else it will be saved as the first element and interpreted as a player ramp by ARK.
      if (!newPlayerRamp) {
        const defaultPlayerLevels = [];
        let total = 0;
        for (let i = 0; i < 105; i++) {
          const xp = Math.floor(10 * Math.pow(i, 2.2));
          total += xp;
          defaultPlayerLevels.push(`ExperiencePointsForLevel[${i}]=${xp}`);
        }
        newPlayerRamp = `(${defaultPlayerLevels.join(',')})`;
        updatedConfig.overrideMaxExperiencePointsPlayer = total.toString();
      }
    }

    // Combine player and dino overrides separated by newline
    const combinedOverrides = [newPlayerRamp, newDinoRamp].filter(Boolean).join('\n');
    updatedConfig.levelExperienceRampOverrides = combinedOverrides;

    onChange(updatedConfig);
    toast.success(`${target === 'player' ? 'Player' : 'Dino'} XP Ramp applied successfully!`);
  };

  const applyDinoLevel = (level: number) => {
    const difficulty = (level / 30).toFixed(1);
    onChange({
      ...config,
      overrideOfficialDifficulty: parseFloat(difficulty),
      difficultyOffset: 1.0
    });
    toast.success(`Wild Dino Max Level set to ${level}`);
  };

  const paginatedData = useMemo(() => {
    const startIndex = page * itemsPerPage;
    return xpData.slice(startIndex, startIndex + itemsPerPage);
  }, [xpData, page]);

  const maxPage = Math.ceil(xpData.length / itemsPerPage);

  const applyPreset = (preset: 'official' | 'high' | 'brutal') => {
    if (preset === 'official') {
      setBaseXp(10);
      setExponent(2.2);
      setMaxLevel(target === 'player' ? 105 : 88);
    } else if (preset === 'high') {
      setBaseXp(5);
      setExponent(1.8);
      setMaxLevel(target === 'player' ? 150 : 120);
    } else if (preset === 'brutal') {
      setBaseXp(20);
      setExponent(2.5);
      setMaxLevel(target === 'player' ? 80 : 60);
    }
    setPage(0);
    toast.success(`Applied ${preset} preset curve settings!`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-500" />
          Level & XP Generator
        </h3>
        <p className="text-slate-400 text-sm">
          Generate custom experience ramps for players and dinos, or configure maximum wild dino levels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Dynamic XP Generator Configuration */}
        <div className="lg:col-span-3 glass-panel rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Target & Presets Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
              <div>
                <h4 className="text-base font-bold text-slate-200">Custom Experience Curve</h4>
                <p className="text-xs text-slate-400 mt-1">Configure target and rate coefficients</p>
              </div>

              {/* Target Selector */}
              <div className="flex bg-[#0a0f1d]/60 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setTarget('player')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none",
                    target === 'player' ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Players
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('dino')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none",
                    target === 'dino' ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Tamed Dinos
                </button>
              </div>
            </div>

            {/* Presets Button Group */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 mr-2 font-semibold">Presets:</span>
              {['official', 'high', 'brutal'].map((preset) => {
                const label = preset === 'official' ? 'Official Scale' : preset === 'high' ? 'High-Rate' : 'Brutal Curve';
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset as any)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/30 text-[11px] font-bold text-slate-300 rounded-lg transition-all focus:outline-none"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Custom Input Sliders */}
            <div className="space-y-5">
              <GeneratorSlider
                label="Max Level Limit"
                min={5}
                max={500}
                step={1}
                value={maxLevel}
                onChange={setMaxLevel}
              />

              <GeneratorSlider
                label="Base XP Multiplier"
                min={1}
                max={100}
                step={1}
                value={baseXp}
                onChange={setBaseXp}
              />

              <GeneratorSlider
                label="Exponential Curve Exponent"
                min={1.0}
                max={4.0}
                step={0.05}
                value={exponent}
                onChange={setExponent}
                isFloat={true}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyXpRamp}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/10 active:scale-[0.98] focus:outline-none"
          >
            <Check className="w-4 h-4" />
            Apply {target === 'player' ? 'Player' : 'Dino'} XP Ramp
          </button>
        </div>

        {/* Visualizer & Preview Table */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col justify-between gap-5">
          <div>
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              XP Curve Visualization
            </h4>

            {/* SVG Line Chart */}
            <div className="w-full bg-[#0a0f1d]/60 rounded-xl p-3 border border-white/10 flex items-center justify-center relative overflow-hidden h-[124px]">
              {xpData.length > 1 ? (
                <svg width="320" height="120" viewBox="0 0 320 120" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="10" y1="10" x2="310" y2="10" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  <line x1="10" y1="60" x2="310" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  <line x1="10" y1="110" x2="310" y2="110" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                  {/* Gradient Area Fill */}
                  <path d={svgFillPath} fill="url(#xpGradient)" />

                  {/* Stroke Line */}
                  <path d={svgPath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                  
                  {/* Endpoint Marker */}
                  {xpData.length > 0 && (
                    <circle
                      cx={310}
                      cy={10}
                      r="4"
                      fill="#f59e0b"
                      className="animate-pulse"
                    />
                  )}
                </svg>
              ) : (
                <span className="text-xs text-slate-500">Insufficient levels data</span>
              )}
            </div>
          </div>

          {/* Level XP Table Panel */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Table className="w-4 h-4 text-amber-500" />
              Level Progression Table
            </h4>

            <div className="bg-[#0a0f1d]/40 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] text-slate-400 uppercase font-black tracking-wider bg-slate-950/40">
                    <th className="py-2.5 px-2 whitespace-nowrap">Level</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">XP Required</th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">Total XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-xs font-medium text-slate-350">
                  {paginatedData.map((d) => (
                    <tr key={d.level} className="hover:bg-white/[0.01]">
                      <td className="py-2 px-2 font-bold text-slate-300 font-mono whitespace-nowrap">Lvl {d.level}</td>
                      <td className="py-2 px-2 font-mono whitespace-nowrap">{d.xpNeeded.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono font-semibold text-amber-400 whitespace-nowrap">{d.totalXp.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Table Pagination Controls */}
              <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 bg-[#0a0f1d]/60 text-slate-400 text-[10px] font-bold">
                <span>Page {page + 1} of {maxPage || 1}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 px-1.5 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 rounded-lg text-slate-300 transition-all focus:outline-none"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(maxPage - 1, p + 1))}
                    disabled={page >= maxPage - 1}
                    className="p-1 px-1.5 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 rounded-lg text-slate-300 transition-all focus:outline-none"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wild Dino Max Level & Difficulty Offset */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 glass-panel rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div>
            <h4 className="text-base font-bold text-slate-200">Wild Dino Max Level</h4>
            <p className="text-xs text-slate-455 mt-1 mb-6">
              Automatically calculates the required Official Difficulty settings to achieve this maximum wild dino level on spawn.
            </p>
            <GeneratorSlider
              label="Dino Level Target"
              min={30}
              max={600}
              step={30}
              value={wildDinoLevel}
              onChange={setWildDinoLevel}
            />
          </div>
          <button
            type="button"
            onClick={() => applyDinoLevel(wildDinoLevel)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/10 active:scale-[0.98] focus:outline-none"
          >
            <Check className="w-4 h-4" />
            Apply Wild Dino Difficulty
          </button>
        </div>

        {/* Info card */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-4">
          <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Formula Parameters
          </h4>

          <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed font-medium">
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">XP Progression Math</span>
              XP is generated dynamically per level using: <code className="bg-[#0a0f1d]/80 px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-amber-400 font-mono">BaseXP * Level ^ Exponent</code>
            </div>
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">Dual-Ramp Injection</span>
              Applies distinct overrides for players (first array line) and dinos (second array line) in Game.ini.
            </div>
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">Difficulty Offset Calculation</span>
              Dino spawns use <code className="bg-[#0a0f1d]/80 px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-amber-400 font-mono">Difficulty = Level / 30</code>. A target level of 150 yields a difficulty parameter of 5.0.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-sm text-amber-200/90">
        <Info className="w-5 h-5 shrink-0 text-amber-400" />
        <div>
          <strong className="block mb-1 text-amber-300">Important System Details</strong>
          Applying these curves will write detailed configurations to your <code className="bg-amber-950/60 border border-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 font-mono text-xs">Game.ini</code> file. Experience curves are computed up to the defined level limits.
        </div>
      </div>
    </div>
  );
}
