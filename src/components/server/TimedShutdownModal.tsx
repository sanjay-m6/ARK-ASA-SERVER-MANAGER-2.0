import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Timer, AlertTriangle, X, Save, Square } from 'lucide-react';
import { useTimedShutdownStore } from '../../stores/timedShutdownStore';

interface TimedShutdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: number;
    serverName: string;
    serverType?: 'ASA' | 'ASE';
    onImmediateStop?: () => void;
}

const PRESET_TIMERS = [
    { label: '1 Min', minutes: 1, seconds: 60 },
    { label: '2 Mins', minutes: 2, seconds: 120 },
    { label: '5 Mins', minutes: 5, seconds: 300 },
    { label: '10 Mins', minutes: 10, seconds: 600 },
    { label: '15 Mins', minutes: 15, seconds: 900 },
];

export const TimedShutdownModal: React.FC<TimedShutdownModalProps> = ({
    isOpen,
    onClose,
    serverId,
    serverName,
    serverType = 'ASA',
    onImmediateStop,
}) => {
    const startShutdown = useTimedShutdownStore((state) => state.startShutdown);

    const [selectedPreset, setSelectedPreset] = useState<number>(300); // Default 5 mins (300s)
    const [customMinutes, setCustomMinutes] = useState<number>(5);
    const [customSeconds, setCustomSeconds] = useState<number>(0);
    const [isCustom, setIsCustom] = useState<boolean>(false);
    const [messageTemplate, setMessageTemplate] = useState<string>(
        'Server shutting down in {time}! Please save your items and log out.'
    );
    const [saveWorld, setSaveWorld] = useState<boolean>(true);

    if (!isOpen) return null;

    const handleStart = () => {
        let totalSeconds = selectedPreset;
        if (isCustom) {
            totalSeconds = (customMinutes || 0) * 60 + (customSeconds || 0);
        }

        if (totalSeconds <= 0) return;

        startShutdown(serverId, serverName, serverType, totalSeconds, messageTemplate, saveWorld);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 my-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                            <Timer className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                Timed Graceful Shutdown
                            </h3>
                            <p className="text-xs text-slate-400 font-medium truncate max-w-[280px]">
                                Server: <span className="text-sky-400 font-bold">{serverName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Preset Timers */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Select Countdown Duration
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {PRESET_TIMERS.map((preset) => (
                            <button
                                key={preset.seconds}
                                type="button"
                                onClick={() => {
                                    setSelectedPreset(preset.seconds);
                                    setIsCustom(false);
                                }}
                                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                                    !isCustom && selectedPreset === preset.seconds
                                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setIsCustom(true)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                                isCustom
                                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                        >
                            Custom
                        </button>
                    </div>

                    {/* Custom Input */}
                    {isCustom && (
                        <div className="flex items-center gap-3 pt-2">
                            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                                <span className="text-slate-400 font-medium">Minutes:</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="180"
                                    value={customMinutes}
                                    onChange={(e) => setCustomMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-12 bg-transparent text-white font-bold font-mono focus:outline-none text-center"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                                <span className="text-slate-400 font-medium">Seconds:</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    value={customSeconds}
                                    onChange={(e) => setCustomSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                    className="w-12 bg-transparent text-white font-bold font-mono focus:outline-none text-center"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Broadcast Message */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                            In-Game Broadcast Message
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">Use {'{time}'} for countdown</span>
                    </div>
                    <textarea
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/80 rounded-xl p-3 text-xs text-amber-200 font-medium focus:outline-none custom-scrollbar"
                    />
                </div>

                {/* Options */}
                <div className="pt-1">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                            type="checkbox"
                            checked={saveWorld}
                            onChange={(e) => setSaveWorld(e.target.checked)}
                            className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500/40 cursor-pointer"
                        />
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 group-hover:text-white transition-colors">
                            <Save className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Save World (<span className="font-mono text-emerald-400">SaveWorld</span>) before stopping</span>
                        </div>
                    </label>
                </div>

                {/* Info Note */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        In-game broadcast announcements will be sent to players at standard interval checkpoints (15m, 10m, 5m, 2m, 1m, 30s, 10s) until the final shutdown.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-2">
                    {onImmediateStop ? (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onImmediateStop();
                            }}
                            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Force stop the server immediately without waiting for countdown"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Stop Immediately</span>
                        </button>
                    ) : (
                        <div></div>
                    )}
                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleStart}
                            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <Timer className="w-4 h-4" />
                            <span>Start Shutdown Countdown</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
