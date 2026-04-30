import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Sparkles, Download, Upload, Save, Trash2, X } from 'lucide-react';
import {
    PRESETS,
    ConfigPreset,
    getCustomPresets,
    saveCustomPreset,
    deleteCustomPreset,
    exportPresetToJson,
    importPresetFromJson,
} from '../../data/presets';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface PresetSelectorProps {
    onApplyPreset: (preset: ConfigPreset) => void;
    currentPreset?: string;
    onSaveCurrentAsPreset?: (name: string, description: string) => void;
}

export const PresetSelector = ({ onApplyPreset, currentPreset, onSaveCurrentAsPreset }: PresetSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customPresets, setCustomPresets] = useState<ConfigPreset[]>([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveDesc, setSaveDesc] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setCustomPresets(getCustomPresets());
    }, [isOpen]);

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const preset = importPresetFromJson(text);
            saveCustomPreset(preset);
            setCustomPresets(getCustomPresets());
            toast.success(`Preset "${preset.name}" imported successfully`);
        } catch (err) {
            toast.error(`Import failed: ${err}`);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteCustom = (presetId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteCustomPreset(presetId);
        setCustomPresets(getCustomPresets());
        toast.success('Preset deleted');
    };

    const handleExportPreset = (preset: ConfigPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        exportPresetToJson(preset);
        toast.success(`Preset "${preset.name}" exported`);
    };

    const handleSavePreset = () => {
        if (!saveName.trim()) { toast.error('Please enter a name'); return; }
        if (onSaveCurrentAsPreset) {
            onSaveCurrentAsPreset(saveName.trim(), saveDesc.trim());
        }
        setShowSaveDialog(false);
        setSaveName('');
        setSaveDesc('');
        setCustomPresets(getCustomPresets());
    };

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

            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
                aria-label="Import preset file"
            />

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

                    {/* Dropdown */}
                    <div className="absolute top-full mt-2 right-0 z-50 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
                        {/* Header with actions */}
                        <div className="p-2 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Apply</h3>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                    title="Import Preset (.json)"
                                    aria-label="Import preset from file"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                </button>
                                {onSaveCurrentAsPreset && (
                                    <button
                                        onClick={() => { setShowSaveDialog(true); setIsOpen(false); }}
                                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                        title="Save Current as Preset"
                                        aria-label="Save current settings as preset"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            {/* Built-in presets */}
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
                                        {/* Export button */}
                                        <button
                                            onClick={(e) => handleExportPreset(preset, e)}
                                            className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors flex-shrink-0"
                                            title="Export this preset"
                                            aria-label={`Export ${preset.name} preset`}
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </button>
                            ))}

                            {/* Custom presets section */}
                            {customPresets.length > 0 && (
                                <>
                                    <div className="px-3 py-2 bg-slate-900/30 border-y border-slate-700/50">
                                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Custom Presets</span>
                                    </div>
                                    {customPresets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => {
                                                onApplyPreset(preset);
                                                setIsOpen(false);
                                            }}
                                            className="w-full p-3 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl bg-gradient-to-br from-sky-500 to-blue-600">
                                                    {preset.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-white">{preset.name}</h4>
                                                    <p className="text-xs text-slate-400 mt-0.5">{preset.description}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <button
                                                        onClick={(e) => handleExportPreset(preset, e)}
                                                        className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors"
                                                        title="Export"
                                                        aria-label={`Export ${preset.name}`}
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteCustom(preset.id, e)}
                                                        className="p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                        aria-label={`Delete ${preset.name}`}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>

                        <div className="p-2 border-t border-slate-700 bg-slate-900/50">
                            <p className="text-xs text-slate-500 text-center">
                                Click to apply • Export/Import with JSON
                            </p>
                        </div>
                    </div>
                </>
            )}

            {/* Save Preset Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-96 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Save Current as Preset</h3>
                            <button onClick={() => setShowSaveDialog(false)} className="p-1 hover:bg-white/10 rounded" aria-label="Close save dialog">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="preset-name" className="block text-sm text-slate-400 mb-1">Preset Name</label>
                                <input
                                    id="preset-name"
                                    type="text"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                                    placeholder="My Server Config"
                                />
                            </div>
                            <div>
                                <label htmlFor="preset-desc" className="block text-sm text-slate-400 mb-1">Description (optional)</label>
                                <input
                                    id="preset-desc"
                                    type="text"
                                    value={saveDesc}
                                    onChange={(e) => setSaveDesc(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                                    placeholder="High rates PvE setup"
                                />
                            </div>
                            <button
                                onClick={handleSavePreset}
                                className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-orange-500/20 transition-all text-sm"
                            >
                                Save Preset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
