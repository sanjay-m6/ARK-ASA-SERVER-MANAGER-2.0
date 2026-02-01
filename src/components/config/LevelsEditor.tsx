import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wand2, AlertTriangle, Calculator, Users, PawPrint, Copy } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface LevelsEditorProps {
    getValue: (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue?: string) => string;
    onUpdate: (source: 'GameUserSettings' | 'Game', section: string, key: string, value: string) => void;
}

export default function LevelsEditor({ getValue, onUpdate }: LevelsEditorProps) {
    const SECTION_GAME = '/Script/ShooterGame.ShooterGameMode';

    // Mode State
    const [mode, setMode] = useState<'player' | 'dino'>('player');

    // Generator State
    const [maxLevel, setMaxLevel] = useState(100);
    const [baseXP, setBaseXP] = useState(10);
    const [multiplier, setMultiplier] = useState(1.1);
    const [isGenerating, setIsGenerating] = useState(false);

    // Raw Values Helpers
    const rawRamps = getValue('Game', SECTION_GAME, 'LevelExperienceRampOverrides', '').split('\n');

    // Player ramp is usually 1st (index 0), Dino is 2nd (index 1)
    const playerRamp = rawRamps[0] || '';
    const dinoRamp = rawRamps[1] || '';

    const currentRamp = mode === 'player' ? playerRamp : dinoRamp;

    // Max XP Keys
    const keyMaxXP = mode === 'player' ? 'OverrideMaxExperiencePointsPlayer' : 'OverrideMaxExperiencePointsDino';
    const currentMaxXP = getValue('Game', SECTION_GAME, keyMaxXP, '0');

    const handleUpdateRamp = (val: string) => {
        let newRamps = [...rawRamps];

        if (mode === 'dino' && newRamps.length < 2) {
            if (newRamps.length === 0) newRamps.push(''); // Slot 0
            newRamps.push(''); // Slot 1
        }
        if (mode === 'player' && newRamps.length === 0) newRamps.push('');

        const index = mode === 'player' ? 0 : 1;
        newRamps[index] = val;

        const joined = newRamps.filter(r => r.trim() !== '').join('\n');

        onUpdate('Game', SECTION_GAME, 'LevelExperienceRampOverrides', joined);
    };

    const handleGenerate = () => {
        setIsGenerating(true);
        try {
            const rampEntries: string[] = [];

            for (let i = 0; i < maxLevel; i++) {
                const xp = Math.floor(baseXP * Math.pow(multiplier, i));
                rampEntries.push(`ExperiencePointsForLevel[${i}]=${xp}`);
            }

            const rampString = `(${rampEntries.join(',')})`;

            handleUpdateRamp(rampString);

            const totalMaxXP = Math.floor(baseXP * Math.pow(multiplier, maxLevel));
            onUpdate('Game', SECTION_GAME, keyMaxXP, totalMaxXP.toString());

            toast.success(`Generated ${maxLevel} ${mode === 'player' ? 'Human' : 'Dino'} levels!`);
        } catch (err) {
            toast.error('Failed to generate levels');
            console.error(err);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-4 lg:p-8 custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-300">
                            Levels Generator
                        </h2>
                        <p className="text-slate-400 max-w-xl">
                            Create custom experience curves for players and dinos.
                            Control the pacing of your server's progression.
                        </p>
                    </div>

                    {/* Mode Toggle */}
                    <div className="bg-slate-900/50 p-1.5 rounded-xl border border-white/5 backdrop-blur-sm self-start md:self-auto shadow-lg">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setMode('player')}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all relative overflow-hidden",
                                    mode === 'player'
                                        ? "text-white shadow-lg"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                {mode === 'player' && (
                                    <motion.div
                                        layoutId="mode-highlight"
                                        className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg"
                                        initial={false}
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Human
                                </span>
                            </button>
                            <button
                                onClick={() => setMode('dino')}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all relative overflow-hidden",
                                    mode === 'dino'
                                        ? "text-white shadow-lg"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                {mode === 'dino' && (
                                    <motion.div
                                        layoutId="mode-highlight"
                                        className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg"
                                        initial={false}
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    <PawPrint className="w-4 h-4" />
                                    Dino
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Settings Panel */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-4 glass-panel p-6 lg:p-8 rounded-2xl space-y-8 h-fit relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-500 opacity-50" />

                        <div className="flex items-center gap-3 border-b border-white/5 pb-5">
                            <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                                <Calculator className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Generator Settings</h3>
                                <p className="text-xs text-slate-400">Define your curve parameters</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Max Level</label>
                                <input
                                    type="number"
                                    value={maxLevel}
                                    onChange={(e) => setMaxLevel(parseInt(e.target.value) || 100)}
                                    className="w-full bg-slate-950/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base XP</label>
                                <input
                                    type="number"
                                    value={baseXP}
                                    onChange={(e) => setBaseXP(parseInt(e.target.value) || 10)}
                                    className="w-full bg-slate-950/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Multiplier</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={multiplier}
                                    onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.1)}
                                    className="w-full bg-slate-950/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                                />
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl text-white font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 group transform hover:-translate-y-0.5"
                            >
                                <Wand2 className={cn("w-5 h-5 transition-transform", isGenerating ? "animate-spin" : "group-hover:rotate-12")} />
                                {isGenerating ? 'Generating...' : `Generate ${mode === 'player' ? 'Human' : 'Dino'} Ramp`}
                            </button>

                            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3 text-sm text-amber-200/80 leading-relaxed">
                                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                <p>Generating will fully overwrite the current <strong>{mode}</strong> level ramp configuration.</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Output Panel */}
                    <motion.div
                        key={mode}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:col-span-8 glass-panel p-6 lg:p-8 rounded-2xl flex flex-col h-full relative overflow-hidden"
                    >
                        <div className="flex items-center justify-between border-b border-white/5 pb-5 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-400">
                                    <Copy className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        {mode === 'player' ? 'Human' : 'Dino'} Configuration Output
                                    </h3>
                                    <p className="text-xs text-slate-400">Review generated INI changes</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 flex-1 flex flex-col">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {keyMaxXP}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={currentMaxXP}
                                        onChange={(e) => onUpdate('Game', SECTION_GAME, keyMaxXP, e.target.value)}
                                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all font-mono"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                                        XP Cap
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 flex-1 flex flex-col">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                                    <span>Raw LevelExperienceRampOverrides ({mode === 'player' ? 'Index 0' : 'Index 1'})</span>
                                    <span className="text-slate-600 font-mono text-[10px]">INI ARRAY</span>
                                </label>
                                <textarea
                                    value={currentRamp}
                                    onChange={(e) => handleUpdateRamp(e.target.value)}
                                    className="flex-1 min-h-[400px] w-full bg-slate-950/60 font-mono text-xs text-slate-300 p-6 rounded-xl border border-white/5 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 resize-y leading-relaxed shadow-inner"
                                    placeholder="LevelExperienceRampOverrides=(ExperiencePointsForLevel[0]=...)"
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
