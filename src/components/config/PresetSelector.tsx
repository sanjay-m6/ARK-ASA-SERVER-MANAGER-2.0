import { useState } from 'react';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import { PRESETS, ConfigPreset } from '../../data/presets';
import { cn } from '../../utils/helpers';

interface PresetSelectorProps {
    onApplyPreset: (preset: ConfigPreset) => void;
    currentPreset?: string;
}

export const PresetSelector = ({ onApplyPreset, currentPreset }: PresetSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 transition-all shadow-sm"
            >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Presets</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

                    {/* Dropdown */}
                    <div className="absolute top-full mt-2 right-0 z-50 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
                        <div className="p-2 border-b border-slate-700 bg-slate-900/50">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Apply</h3>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    onClick={() => {
                                        onApplyPreset(preset);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full p-3 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0",
                                        currentPreset === preset.id && "bg-slate-700/30"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center text-2xl bg-gradient-to-br",
                                            preset.color
                                        )}>
                                            {preset.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-white">{preset.name}</h4>
                                                {currentPreset === preset.id && (
                                                    <Check className="w-4 h-4 text-green-400" />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">{preset.description}</p>
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                <span className="text-xs px-2 py-0.5 bg-slate-900 rounded text-slate-300">
                                                    {Object.keys(preset.settings.GameUserSettings).length + Object.keys(preset.settings.Game).length} settings
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="p-2 border-t border-slate-700 bg-slate-900/50">
                            <p className="text-xs text-slate-500 text-center">
                                Click to apply preset values instantly
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
