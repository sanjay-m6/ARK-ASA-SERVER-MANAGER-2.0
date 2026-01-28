import { useState } from 'react';
import { User, Bone, Zap, Heart, Wind, Beef, Weight, Sword, Activity, Shield, Brain, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '../../utils/helpers';

// Stat definitions with their INI keys and descriptions
const PLAYER_STATS = [
    { id: 0, name: 'Health', icon: Heart, color: 'text-red-400', description: 'Maximum health points' },
    { id: 1, name: 'Stamina', icon: Activity, color: 'text-yellow-400', description: 'Maximum stamina for sprinting and actions' },
    { id: 2, name: 'Torpidity', icon: Brain, color: 'text-purple-400', description: 'Resistance to being knocked out' },
    { id: 3, name: 'Oxygen', icon: Wind, color: 'text-cyan-400', description: 'Breath capacity underwater' },
    { id: 4, name: 'Food', icon: Beef, color: 'text-orange-400', description: 'Maximum food capacity' },
    { id: 5, name: 'Water', icon: Zap, color: 'text-blue-400', description: 'Maximum water capacity' },
    { id: 6, name: 'Temperature', icon: Shield, color: 'text-slate-400', description: 'Temperature resistance (unused)' },
    { id: 7, name: 'Weight', icon: Weight, color: 'text-amber-400', description: 'Maximum carry weight' },
    { id: 8, name: 'Melee Damage', icon: Sword, color: 'text-rose-400', description: 'Base melee damage' },
    { id: 9, name: 'Movement Speed', icon: Activity, color: 'text-green-400', description: 'Base movement speed' },
    { id: 10, name: 'Fortitude', icon: Shield, color: 'text-indigo-400', description: 'Resistance to weather and torpor' },
    { id: 11, name: 'Crafting Speed', icon: Brain, color: 'text-teal-400', description: 'Crafting speed' },
];

const DINO_STAT_TYPES = [
    { key: 'Wild', label: 'Wild', description: 'Per-level stat gain for wild dinos', prefix: 'PerLevelStatsMultiplier_DinoWild' },
    { key: 'Tamed', label: 'Tamed', description: 'Per-level stat gain after taming', prefix: 'PerLevelStatsMultiplier_DinoTamed' },
    { key: 'TamedAdd', label: 'Tamed Add', description: 'Additive bonus on tame', prefix: 'PerLevelStatsMultiplier_DinoTamed_Add' },
    { key: 'TamedAffinity', label: 'Tamed Affinity', description: 'Bonus based on taming effectiveness', prefix: 'PerLevelStatsMultiplier_DinoTamed_Affinity' },
];

interface StatMultiplierEditorProps {
    getValue: (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue?: string) => string;
    setValue: (source: 'GameUserSettings' | 'Game', section: string, key: string, value: string) => void;
}

export default function StatMultiplierEditor({ getValue, setValue }: StatMultiplierEditorProps) {
    const [activeTab, setActiveTab] = useState<'player' | 'dino'>('player');
    const [activeDinoType, setActiveDinoType] = useState('Wild');
    const [expandedStats, setExpandedStats] = useState<Set<number>>(new Set());

    // Get/set player stat multiplier
    const getPlayerStat = (statId: number) => {
        const key = `PerLevelStatsMultiplier_Player[${statId}]`;
        return parseFloat(getValue('Game', '/Script/ShooterGame.ShooterGameMode', key, '1.0')) || 1.0;
    };

    const setPlayerStat = (statId: number, value: number) => {
        const key = `PerLevelStatsMultiplier_Player[${statId}]`;
        setValue('Game', '/Script/ShooterGame.ShooterGameMode', key, value.toFixed(1));
    };

    // Get/set dino stat multiplier
    const getDinoStat = (statId: number, type: string) => {
        const prefix = DINO_STAT_TYPES.find(t => t.key === type)?.prefix || 'PerLevelStatsMultiplier_DinoWild';
        const key = `${prefix}[${statId}]`;
        return parseFloat(getValue('Game', '/Script/ShooterGame.ShooterGameMode', key, '1.0')) || 1.0;
    };

    const setDinoStat = (statId: number, type: string, value: number) => {
        const prefix = DINO_STAT_TYPES.find(t => t.key === type)?.prefix || 'PerLevelStatsMultiplier_DinoWild';
        const key = `${prefix}[${statId}]`;
        setValue('Game', '/Script/ShooterGame.ShooterGameMode', key, value.toFixed(1));
    };

    const toggleStat = (statId: number) => {
        const newExpanded = new Set(expandedStats);
        if (newExpanded.has(statId)) {
            newExpanded.delete(statId);
        } else {
            newExpanded.add(statId);
        }
        setExpandedStats(newExpanded);
    };

    // Apply preset multipliers
    const applyPreset = (preset: 'official' | 'boosted' | 'pvp') => {
        const multipliers = {
            official: 1.0,
            boosted: 2.0,
            pvp: 1.5,
        };
        const value = multipliers[preset];

        if (activeTab === 'player') {
            PLAYER_STATS.forEach(stat => {
                setPlayerStat(stat.id, value);
            });
        } else {
            PLAYER_STATS.forEach(stat => {
                setDinoStat(stat.id, activeDinoType, value);
            });
        }
    };

    const renderStatSlider = (
        statId: number,
        name: string,
        icon: React.ComponentType<{ className?: string }>,
        color: string,
        description: string,
        getValue: () => number,
        setValue: (value: number) => void
    ) => {
        const Icon = icon;
        const value = getValue();
        const isExpanded = expandedStats.has(statId);
        const isDisabled = statId === 9; // Movement Speed is disabled in ASA

        return (
            <div
                key={statId}
                className={cn(
                    "bg-slate-800/50 rounded-lg border transition-all duration-200",
                    isDisabled ? "opacity-60 cursor-not-allowed border-slate-800" : (isExpanded ? "border-cyan-500/30" : "border-slate-700/50 hover:border-slate-600")
                )}
            >
                <div
                    className={cn("flex items-center justify-between p-3", !isDisabled && "cursor-pointer")}
                    onClick={() => !isDisabled && toggleStat(statId)}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-slate-900/50", color.replace('text-', 'bg-').replace('400', '500/20'))}>
                            <Icon className={cn("w-4 h-4", color)} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="text-sm font-medium text-white">{name}</div>
                                {isDisabled && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">ASA Disabled</span>}
                            </div>
                            <div className="text-xs text-slate-500">{description}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isDisabled && (
                            <div className={cn(
                                "px-3 py-1 rounded-lg font-mono text-sm font-medium",
                                value === 1.0 ? "bg-slate-700 text-slate-300" :
                                    value > 1.0 ? "bg-green-500/20 text-green-400" :
                                        "bg-red-500/20 text-red-400"
                            )}>
                                {value.toFixed(1)}x
                            </div>
                        )}
                        {!isDisabled && (isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                        ))}
                    </div>
                </div>

                {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-slate-700/50 mt-1 pt-3">
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0.1"
                                max="10"
                                step="0.1"
                                value={value}
                                onChange={(e) => setValue(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <input
                                type="number"
                                min="0.1"
                                max="100"
                                step="0.1"
                                value={value}
                                onChange={(e) => setValue(parseFloat(e.target.value) || 1.0)}
                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            {[0.5, 1.0, 2.0, 5.0, 10.0].map(preset => (
                                <button
                                    key={preset}
                                    onClick={() => setValue(preset)}
                                    className={cn(
                                        "flex-1 py-1 rounded text-xs font-medium transition-colors",
                                        value === preset
                                            ? "bg-cyan-500 text-white"
                                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                    )}
                                >
                                    {preset}x
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header with tabs */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('player')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            activeTab === 'player'
                                ? "bg-indigo-500/20 text-indigo-400"
                                : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <User className="w-4 h-4" />
                        Player Stats
                    </button>
                    <button
                        onClick={() => setActiveTab('dino')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            activeTab === 'dino'
                                ? "bg-orange-500/20 text-orange-400"
                                : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <Bone className="w-4 h-4" />
                        Dino Stats
                    </button>
                </div>

                {/* Preset buttons */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Presets:</span>
                    <button
                        onClick={() => applyPreset('official')}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                    >
                        Official
                    </button>
                    <button
                        onClick={() => applyPreset('boosted')}
                        className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors"
                    >
                        Boosted
                    </button>
                    <button
                        onClick={() => applyPreset('pvp')}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
                    >
                        PvP Meta
                    </button>
                    <button
                        onClick={() => applyPreset('official')}
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg transition-colors"
                        title="Reset All"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dino type selector (only for dino tab) */}
            {activeTab === 'dino' && (
                <div className="flex gap-2 p-1 bg-slate-900/30 rounded-lg">
                    {DINO_STAT_TYPES.map(type => (
                        <button
                            key={type.key}
                            onClick={() => setActiveDinoType(type.key)}
                            className={cn(
                                "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
                                activeDinoType === type.key
                                    ? "bg-orange-500/20 text-orange-400"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <div>{type.label}</div>
                            <div className="text-xs opacity-60">{type.description}</div>
                        </button>
                    ))}
                </div>
            )}

            {/* Stat sliders */}
            <div className="grid gap-2">
                {PLAYER_STATS.map(stat => (
                    renderStatSlider(
                        stat.id,
                        stat.name,
                        stat.icon,
                        stat.color,
                        stat.description,
                        activeTab === 'player'
                            ? () => getPlayerStat(stat.id)
                            : () => getDinoStat(stat.id, activeDinoType),
                        activeTab === 'player'
                            ? (value) => setPlayerStat(stat.id, value)
                            : (value) => setDinoStat(stat.id, activeDinoType, value)
                    )
                ))}
            </div>

            {/* Info box */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-2">💡 How Per-Stat Multipliers Work</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                    <li>• <strong className="text-slate-400">1.0x</strong> = Official/default rates</li>
                    <li>• <strong className="text-green-400">Above 1.0x</strong> = More points per level</li>
                    <li>• <strong className="text-red-400">Below 1.0x</strong> = Fewer points per level</li>
                    <li>• Changes are written to <code className="text-purple-400">Game.ini</code></li>
                </ul>
            </div>
        </div>
    );
}
