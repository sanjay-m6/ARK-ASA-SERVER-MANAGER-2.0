
import { motion } from 'framer-motion';
import { Zap, Shield, BarChart3, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

interface StatsEditorProps {
    getValue: (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue?: string) => string;
    onUpdate: (source: 'GameUserSettings' | 'Game', section: string, key: string, value: string) => void;
}

const STAT_NAMES = [
    'Health', 'Stamina', 'Torpidity', 'Oxygen', 'Food', 'Water',
    'Temperature', 'Weight', 'Melee Damage', 'Movement Speed', 'Fortitude', 'Crafting Speed'
];

type StatGroupKey = 'player' | 'wild' | 'tamed' | 'add' | 'affinity';

const STAT_GROUPS = [
    {
        id: 'player' as StatGroupKey,
        label: 'Player Stats',
        prefix: 'PerLevelStatsMultiplier_Player',
        description: 'Multipliers for stats gained per level up for players.'
    },
    {
        id: 'wild' as StatGroupKey,
        label: 'Wild Dino Stats',
        prefix: 'PerLevelStatsMultiplier_DinoWild',
        description: 'Multipliers for stats of wild dinos per level.'
    },
    {
        id: 'tamed' as StatGroupKey,
        label: 'Tamed Dino Stats',
        prefix: 'PerLevelStatsMultiplier_DinoTamed',
        description: 'Multipliers for stats gained per level up for tamed dinos.'
    },
    {
        id: 'add' as StatGroupKey,
        label: 'Tamed Dino Add',
        prefix: 'PerLevelStatsMultiplier_DinoTamed_Add',
        description: 'Additive bonus for tamed dinos.'
    },
    {
        id: 'affinity' as StatGroupKey,
        label: 'Tamed Dino Affinity',
        prefix: 'PerLevelStatsMultiplier_DinoTamed_Affinity',
        description: 'Multipliers for taming affinity bonuses.'
    }
];

const PRESETS = [
    {
        id: 'official',
        name: 'Official',
        icon: Shield,
        description: 'Standard official server rates (1.0x)',
        color: 'blue',
        values: {
            player: 1.0, wild: 1.0, tamed: 1.0, add: 0.14, affinity: 0.44
        }
    },
    {
        id: 'lite',
        name: 'Lite Boost (2x)',
        icon: Zap,
        description: 'Slightly boosted stats for ease of play',
        color: 'emerald',
        values: {
            player: 2.0, wild: 1.0, tamed: 2.0, add: 0.14, affinity: 1.0
        }
    },
    {
        id: 'high',
        name: 'High Boost (10x)',
        icon: BarChart3,
        description: 'Significantly increased stats for fast progression',
        color: 'purple',
        values: {
            player: 10.0, wild: 1.0, tamed: 5.0, add: 0.5, affinity: 2.0
        }
    },
    {
        id: 'fibercraft',
        name: 'Fibercraft / OP',
        icon: AlertTriangle,
        description: 'Extreme stats for PvP sandbox (50x+)',
        color: 'orange',
        values: {
            player: 50.0, wild: 1.0, tamed: 20.0, add: 1.0, affinity: 5.0
        }
    }
];

export default function StatsEditor({ getValue, onUpdate }: StatsEditorProps) {
    const SECTION = '/Script/ShooterGame.ShooterGameMode';

    const applyPreset = (preset: typeof PRESETS[0]) => {
        STAT_GROUPS.forEach(group => {
            STAT_NAMES.forEach((_, index) => {
                const key = `${group.prefix}[${index}]`;
                let val = preset.values[group.id].toString();

                if (preset.id !== 'official' && index === 7) {
                    // Double value for weight on boosted presets
                    val = (preset.values[group.id] * 2).toString();
                }

                onUpdate('Game', SECTION, key, val);
            });
        });
        toast.success(`Applied ${preset.name} multipliers`);
    };

    return (
        <div className="h-full overflow-y-auto p-4 lg:p-8 custom-scrollbar">
            <div className="max-w-7xl mx-auto space-y-8 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 text-center lg:text-left"
                >
                    <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                        Per-Stat Multipliers
                    </h2>
                    <p className="text-slate-400 max-w-2xl">
                        Fine-tune exactly how much stats increase per level point spent.
                        Use defaults for a vanilla experience or boost them for a custom feel.
                    </p>
                </motion.div>

                {/* Presets Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {PRESETS.map((preset, idx) => (
                        <motion.button
                            key={preset.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => applyPreset(preset)}
                            className={cn(
                                "group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-300",
                                "bg-slate-900/40 backdrop-blur-md border border-white/5 hover:border-white/10 hover:bg-slate-800/60 shadow-xl",
                                "hover:shadow-2xl hover:-translate-y-1"
                            )}
                        >
                            <div className={cn(
                                "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300",
                                preset.color === 'blue' && "bg-blue-500",
                                preset.color === 'emerald' && "bg-emerald-500",
                                preset.color === 'purple' && "bg-purple-500",
                                preset.color === 'orange' && "bg-orange-500"
                            )} />

                            <div className="flex items-start justify-between mb-3 relative z-10">
                                <div className={cn(
                                    "p-2.5 rounded-xl bg-slate-950/50 border border-white/5",
                                    `text-${preset.color}-400 group-hover:text-${preset.color}-300 transition-colors`
                                )}>
                                    <preset.icon className="w-6 h-6" />
                                </div>
                                <div className={cn(
                                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                    "border-white/5 bg-white/5 text-slate-400"
                                )}>
                                    Preset
                                </div>
                            </div>

                            <div className="relative z-10">
                                <div className="font-bold text-white text-lg group-hover:text-cyan-50 transition-colors">
                                    {preset.name}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 leading-relaxed group-hover:text-slate-300 transition-colors">
                                    {preset.description}
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>

                <div className="space-y-6">
                    {STAT_GROUPS.map((group, groupIdx) => (
                        <motion.div
                            key={group.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + (groupIdx * 0.1) }}
                            className="glass-panel p-6 lg:p-8 rounded-2xl relative overflow-hidden"
                        >
                            {/* Decorative gradient blob */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                            <div className="flex items-start gap-4 border-b border-white/5 pb-6 mb-6 relative z-10">
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <div className="h-6 w-1 rounded-full bg-gradient-to-b from-cyan-500 to-blue-600" />
                                        {group.label}
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1 pl-3">{group.description}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10">
                                {STAT_NAMES.map((stat, index) => {
                                    const key = `${group.prefix}[${index}]`;
                                    const value = getValue('Game', SECTION, key, '1.0');
                                    const numVal = parseFloat(value || '0');
                                    const isModified = numVal !== 1.0;

                                    return (
                                        <div key={key} className="space-y-2 group">
                                            <div className="flex items-center justify-between">
                                                <label className={cn(
                                                    "text-xs font-bold uppercase tracking-wider transition-colors",
                                                    isModified ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"
                                                )}>
                                                    {stat}
                                                </label>
                                                <span className="text-[10px] text-slate-700 font-mono group-hover:text-slate-600 transition-colors">
                                                    ID: {index}
                                                </span>
                                            </div>

                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={value}
                                                    onChange={(e) => onUpdate('Game', SECTION, key, e.target.value)}
                                                    step={0.1}
                                                    min={0}
                                                    className={cn(
                                                        "w-full bg-slate-950/40 border rounded-xl px-4 py-3 text-sm text-white transition-all font-mono",
                                                        "focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
                                                        isModified
                                                            ? "border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                                                            : "border-white/5 group-hover:border-white/10"
                                                    )}
                                                />

                                                {/* Magnitude Indicator */}
                                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50 rounded-b-xl overflow-hidden mx-[1px] mb-[1px]">
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-500",
                                                            numVal > 1.0 ? "bg-cyan-500" : "bg-slate-600"
                                                        )}
                                                        style={{ width: `${Math.min(numVal * 10, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
