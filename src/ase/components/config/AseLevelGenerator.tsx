import { useState, useEffect, useMemo } from 'react';
import { Flame, Info, Check, TrendingUp, Table, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { AseGameConfig } from '../../types/ase.types';
import { toast } from 'react-hot-toast';
import { cn } from '../../../utils/helpers';

interface AseLevelGeneratorProps {
  config: AseGameConfig;
  onChange: (updatedConfig: AseGameConfig) => void;
}

type GeneratorTarget = 'player' | 'dino';

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
        setMaxLevel(detectedMaxLevel);
      }
    } else {
      // Default presets if no ramp exists
      setMaxLevel(target === 'player' ? 105 : 88);
    }
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

    let updatedConfig = { ...config };

    if (target === 'player') {
      newPlayerRamp = rampString;
      updatedConfig.overrideMaxExperiencePointsPlayer = maxExperience;
    } else {
      newDinoRamp = rampString;
      updatedConfig.overrideMaxExperiencePointsDino = maxExperience;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic XP Generator Configuration */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Target & Presets Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
              <div>
                <h4 className="text-base font-bold text-slate-200">Custom Experience curve</h4>
                <p className="text-xs text-slate-400 mt-1">Configure target and rate coefficients</p>
              </div>

              {/* Target Selector */}
              <div className="flex bg-slate-950/50 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setTarget('player')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    target === 'player' ? "bg-amber-500 text-slate-950" : "text-slate-450 hover:text-slate-200"
                  )}
                >
                  Players
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('dino')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    target === 'dino' ? "bg-amber-500 text-slate-950" : "text-slate-450 hover:text-slate-200"
                  )}
                >
                  Tamed Dinos
                </button>
              </div>
            </div>

            {/* Presets Button Group */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 mr-2 font-semibold">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('official')}
                className="px-2.5 py-1 bg-slate-800/40 hover:bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700/50 rounded-lg transition-all"
              >
                Official Scale
              </button>
              <button
                type="button"
                onClick={() => applyPreset('high')}
                className="px-2.5 py-1 bg-slate-800/40 hover:bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700/50 rounded-lg transition-all"
              >
                High-Rate
              </button>
              <button
                type="button"
                onClick={() => applyPreset('brutal')}
                className="px-2.5 py-1 bg-slate-800/40 hover:bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700/50 rounded-lg transition-all"
              >
                Brutal Curve
              </button>
            </div>

            {/* Custom Input Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Max Level Slider */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex justify-between">
                  <span>Max Level Limit</span>
                  <span className="text-amber-500 font-mono">{maxLevel}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="500"
                    value={maxLevel}
                    onChange={(e) => setMaxLevel(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <input
                    type="number"
                    min="5"
                    max="500"
                    value={maxLevel}
                    onChange={(e) => setMaxLevel(parseInt(e.target.value))}
                    className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-center font-mono"
                  />
                </div>
              </div>

              {/* Base XP Modifier */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex justify-between">
                  <span>Base XP Multiplier</span>
                  <span className="text-amber-500 font-mono">{baseXp}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={baseXp}
                    onChange={(e) => setBaseXp(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={baseXp}
                    onChange={(e) => setBaseXp(parseInt(e.target.value))}
                    className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-center font-mono"
                  />
                </div>
              </div>

              {/* Exponent Factor */}
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold text-slate-300 flex justify-between">
                  <span>Exponential Curve Exponent</span>
                  <span className="text-amber-500 font-mono">{exponent.toFixed(2)}</span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={exponent}
                    onChange={(e) => setExponent(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <input
                    type="number"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={exponent}
                    onChange={(e) => setExponent(parseFloat(e.target.value))}
                    className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-center font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyXpRamp}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/10"
          >
            <Check className="w-4 h-4" />
            Apply {target === 'player' ? 'Player' : 'Dino'} XP Ramp
          </button>
        </div>

        {/* Visualizer & Preview Table */}
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-between gap-5">
          <div>
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              XP Curve Visualization
            </h4>

            {/* SVG Line Chart */}
            <div className="w-full bg-slate-950/60 rounded-xl p-3 border border-white/5 flex items-center justify-center relative overflow-hidden h-[124px]">
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

            <div className="bg-slate-950/60 border border-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase font-black tracking-wider bg-slate-950/30">
                    <th className="py-2.5 px-3">Level</th>
                    <th className="py-2.5 px-3">XP Required</th>
                    <th className="py-2.5 px-3 text-right">Total XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-xs font-medium text-slate-350">
                  {paginatedData.map((d) => (
                    <tr key={d.level} className="hover:bg-white/[0.01]">
                      <td className="py-2 px-3 font-bold text-slate-300 font-mono">Lvl {d.level}</td>
                      <td className="py-2 px-3 font-mono">{d.xpNeeded.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-amber-400">{d.totalXp.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Table Pagination Controls */}
              <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 bg-slate-950/20 text-slate-450 text-[10px] font-bold">
                <span>Page {page + 1} of {maxPage || 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 rounded border border-white/5 text-slate-300"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(maxPage - 1, p + 1))}
                    disabled={page >= maxPage - 1}
                    className="p-1 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 rounded border border-white/5 text-slate-300"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div>
            <h4 className="text-base font-bold text-slate-200">Wild Dino Max Level</h4>
            <p className="text-xs text-slate-450 mt-1 mb-6">
              Automatically calculates the required Official Difficulty settings to achieve this maximum wild dino level on spawn.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex justify-between">
                <span>Dino Level Target</span>
                <span className="text-amber-500 font-mono">{wildDinoLevel}</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="30"
                  max="600"
                  step="30"
                  value={wildDinoLevel}
                  onChange={(e) => setWildDinoLevel(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <input
                  type="number"
                  min="30"
                  max="600"
                  step="30"
                  value={wildDinoLevel}
                  onChange={(e) => setWildDinoLevel(parseInt(e.target.value))}
                  className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-center font-mono"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => applyDinoLevel(wildDinoLevel)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/10"
          >
            <Check className="w-4 h-4" />
            Apply Wild Dino Difficulty
          </button>
        </div>

        {/* Info card */}
        <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
          <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Formula Parameters
          </h4>

          <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed font-medium">
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">XP Progression Math</span>
              XP is generated dynamically per level using: <code className="bg-slate-950/80 px-1.5 py-0.5 rounded border border-white/5 text-[10px] text-amber-400 font-mono">BaseXP * Level ^ Exponent</code>
            </div>
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">Dual-Ramp Injection</span>
              Applies distinct overrides for players (first array line) and dinos (second array line) in Game.ini.
            </div>
            <div>
              <span className="text-slate-200 font-semibold block mb-0.5">Difficulty Offset calculation</span>
              Dino spawns use <code className="bg-slate-950/80 px-1.5 py-0.5 rounded border border-white/5 text-[10px] text-amber-400 font-mono">Difficulty = Level / 30</code>. A target level of 150 yields a difficulty parameter of 5.0.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-sm text-amber-250">
        <Info className="w-5 h-5 shrink-0 text-amber-400" />
        <div>
          <strong className="block mb-1 text-amber-300">Important System Details</strong>
          Applying these curves will write detailed configurations to your <code className="bg-amber-950/40 px-1 rounded text-amber-300">Game.ini</code> file. Experience curves are computed up to the defined level limits.
        </div>
      </div>
    </div>
  );
}
