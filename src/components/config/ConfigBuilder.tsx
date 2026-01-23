import { useState, useEffect, useMemo } from 'react';
import {
    Save, Loader2, Map, Users, Swords, Egg, Home, Sun, Copy, FileText, Zap
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { MAP_PROFILES, getMapProfile } from '../../data/mapProfiles';
import { cn } from '../../utils/helpers';

interface ServerConfig {
    sessionName: string;
    serverPassword: string | null;
    adminPassword: string;
    maxPlayers: number;
    mapName: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    rconEnabled: boolean;
    xpMultiplier: number;
    harvestAmountMultiplier: number;
    tamingSpeedMultiplier: number;
    difficultyOffset: number;
    overrideOfficialDifficulty: number;
    dayCycleSpeedScale: number;
    dayTimeSpeedScale: number;
    nightTimeSpeedScale: number;
    playerDamageMultiplier: number;
    playerResistanceMultiplier: number;
    playerFoodDrainMultiplier: number;
    playerWaterDrainMultiplier: number;
    playerStaminaDrainMultiplier: number;
    dinoDamageMultiplier: number;
    dinoResistanceMultiplier: number;
    dinoFoodDrainMultiplier: number;
    wildDinoCountMultiplier: number;
    eggHatchSpeedMultiplier: number;
    babyMatureSpeedMultiplier: number;
    babyFoodConsumptionMultiplier: number;
    matingIntervalMultiplier: number;
    structureDamageMultiplier: number;
    structureResistanceMultiplier: number;
    structureDecayMultiplier: number;
    pveMode: boolean;
    pvpGamma: boolean;
    friendlyFire: boolean;
    activeMods: string[];
}

interface Props {
    serverId?: number;
    installPath?: string;
    initialMapName?: string;
    onConfigSaved?: () => void;
}

const CATEGORIES = [
    { id: 'map', label: 'Map', icon: Map, color: 'from-emerald-500 to-green-500' },
    { id: 'rates', label: 'Rates', icon: Zap, color: 'from-amber-500 to-orange-500' },
    { id: 'player', label: 'Player', icon: Users, color: 'from-blue-500 to-cyan-500' },
    { id: 'dino', label: 'Dinos', icon: Swords, color: 'from-purple-500 to-pink-500' },
    { id: 'breeding', label: 'Breeding', icon: Egg, color: 'from-pink-500 to-rose-500' },
    { id: 'structure', label: 'Structure', icon: Home, color: 'from-slate-500 to-gray-500' },
    { id: 'daynight', label: 'Day/Night', icon: Sun, color: 'from-yellow-500 to-amber-500' },
];

export default function ConfigBuilder({ serverId, installPath, initialMapName, onConfigSaved }: Props) {
    const [config, setConfig] = useState<ServerConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeCategory, setActiveCategory] = useState('map');
    const [showPreview, setShowPreview] = useState(false);
    const [previewContent, setPreviewContent] = useState('');

    const selectedMapProfile = useMemo(() =>
        config ? getMapProfile(config.mapName) : null,
        [config?.mapName]
    );

    // Load default config on mount
    useEffect(() => {
        loadDefaultConfig();
    }, []);

    const loadDefaultConfig = async () => {
        try {
            const defaultConfig = await invoke<ServerConfig>('get_default_config');
            if (initialMapName) {
                defaultConfig.mapName = initialMapName;
            }
            setConfig(defaultConfig);
        } catch (error) {
            console.error('Failed to load config:', error);
            toast.error('Failed to load configuration');
        } finally {
            setIsLoading(false);
        }
    };

    const updateConfig = <K extends keyof ServerConfig>(key: K, value: ServerConfig[K]) => {
        if (!config) return;
        setConfig({ ...config, [key]: value });
    };

    const applyMapProfile = async (mapId: string) => {
        if (!config) return;

        try {
            const updatedConfig = await invoke<ServerConfig>('apply_map_profile_to_config', {
                config,
                mapId
            });
            setConfig(updatedConfig);
            toast.success(`Applied ${getMapProfile(mapId)?.mapName || mapId} profile`);
        } catch (error) {
            console.error('Failed to apply profile:', error);
            toast.error('Failed to apply map profile');
        }
    };

    const generatePreview = async () => {
        if (!config) return;

        try {
            const gus = await invoke<string>('preview_game_user_settings', { config });
            const game = await invoke<string>('preview_game_ini', { config });
            setPreviewContent(`=== GameUserSettings.ini ===\n${gus}\n\n=== Game.ini ===\n${game}`);
            setShowPreview(true);
        } catch (error) {
            console.error('Failed to generate preview:', error);
            toast.error('Failed to generate preview');
        }
    };

    const saveConfig = async () => {
        if (!config || !installPath || !serverId) {
            toast.error('No server or install path specified');
            return;
        }

        setIsSaving(true);
        try {
            await invoke('write_server_configs', {
                serverId,
                installPath,
                config,
                backup: true
            });
            toast.success('Configuration saved!');

            // Refresh servers list to reflect the updated config in UI
            const { useServerStore } = await import('../../stores/serverStore');
            useServerStore.getState().refreshServers();

            onConfigSaved?.();
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error(`Failed to save: ${error}`);
        } finally {
            setIsSaving(false);
        }
    };

    const copyStartupCommand = async () => {
        if (!config || !installPath) return;

        try {
            const cmd = await invoke<string>('generate_startup_command', { config, installPath });
            await navigator.clipboard.writeText(cmd);
            toast.success('Startup command copied!');
        } catch (error) {
            console.error('Failed to copy command:', error);
        }
    };

    if (isLoading || !config) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Map Selection Header */}
            <div
                className="rounded-2xl p-6 border transition-all duration-300"
                style={{
                    background: selectedMapProfile
                        ? `linear-gradient(135deg, ${selectedMapProfile.color}15 0%, transparent 100%)`
                        : 'rgba(30, 41, 59, 0.5)',
                    borderColor: selectedMapProfile ? `${selectedMapProfile.color}40` : 'rgba(51, 65, 85, 0.5)'
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center text-4xl"
                            style={{ backgroundColor: selectedMapProfile ? `${selectedMapProfile.color}20` : 'rgba(148, 163, 184, 0.2)' }}
                        >
                            {selectedMapProfile?.icon || '🗺️'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{selectedMapProfile?.mapName || 'Select Map'}</h2>
                            <p className="text-slate-400">{selectedMapProfile?.description || 'Choose a map to configure'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={generatePreview}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Preview INI
                        </button>
                        <button
                            onClick={copyStartupCommand}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                            Copy Command
                        </button>
                    </div>
                </div>

                {/* Map Grid */}
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {MAP_PROFILES.map(profile => (
                        <button
                            key={profile.mapId}
                            onClick={() => applyMapProfile(profile.mapId)}
                            className={cn(
                                "p-3 rounded-xl border transition-all flex flex-col items-center gap-1",
                                config.mapName === profile.mapId
                                    ? "bg-white/10 border-white/30"
                                    : "bg-slate-800/30 border-transparent hover:bg-slate-800/50 hover:border-slate-700"
                            )}
                            style={{
                                borderColor: config.mapName === profile.mapId ? profile.color : undefined
                            }}
                        >
                            <span className="text-2xl">{profile.icon}</span>
                            <span className="text-xs text-slate-300 truncate w-full text-center">{profile.mapName}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-all",
                                activeCategory === cat.id
                                    ? `bg-gradient-to-r ${cat.color} text-white shadow-lg`
                                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {cat.label}
                        </button>
                    );
                })}
            </div>

            {/* Settings Panel */}
            <div className="bg-slate-800/30 rounded-2xl p-6 border border-slate-700/50">
                {activeCategory === 'map' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingInput label="Session Name" value={config.sessionName} onChange={v => updateConfig('sessionName', v)} />
                        <SettingInput label="Server Password" value={config.serverPassword || ''} onChange={v => updateConfig('serverPassword', v || null)} placeholder="Leave empty for no password" />
                        <SettingInput label="Admin Password" value={config.adminPassword} onChange={v => updateConfig('adminPassword', v)} />
                        <SettingSlider label="Max Players" value={config.maxPlayers} onChange={v => updateConfig('maxPlayers', v)} min={1} max={127} step={1} />
                        <SettingToggle label="PvE Mode" value={config.pveMode} onChange={v => updateConfig('pveMode', v)} description="Disable player damage" />
                        <SettingToggle label="RCON Enabled" value={config.rconEnabled} onChange={v => updateConfig('rconEnabled', v)} description="Enable remote console access" />
                        <SettingSlider label="RCON Port" value={config.rconPort} onChange={v => updateConfig('rconPort', v)} min={1} max={65535} step={1} description="Default: 27020" />
                    </div>
                )}

                {activeCategory === 'rates' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="XP Multiplier" value={config.xpMultiplier} onChange={v => updateConfig('xpMultiplier', v)} min={0.1} max={10} step={0.1} />
                        <SettingSlider label="Harvest Amount" value={config.harvestAmountMultiplier} onChange={v => updateConfig('harvestAmountMultiplier', v)} min={0.1} max={10} step={0.1} />
                        <SettingSlider label="Taming Speed" value={config.tamingSpeedMultiplier} onChange={v => updateConfig('tamingSpeedMultiplier', v)} min={0.1} max={20} step={0.5} />
                        <SettingSlider label="Difficulty Offset" value={config.difficultyOffset} onChange={v => updateConfig('difficultyOffset', v)} min={0} max={2} step={0.1} />
                        <SettingSlider label="Override Difficulty" value={config.overrideOfficialDifficulty} onChange={v => updateConfig('overrideOfficialDifficulty', v)} min={1} max={15} step={0.5} description="5.0 = max level 150" />
                    </div>
                )}

                {activeCategory === 'player' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="Player Damage" value={config.playerDamageMultiplier} onChange={v => updateConfig('playerDamageMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Player Resistance" value={config.playerResistanceMultiplier} onChange={v => updateConfig('playerResistanceMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Food Drain" value={config.playerFoodDrainMultiplier} onChange={v => updateConfig('playerFoodDrainMultiplier', v)} min={0.1} max={3} step={0.1} />
                        <SettingSlider label="Water Drain" value={config.playerWaterDrainMultiplier} onChange={v => updateConfig('playerWaterDrainMultiplier', v)} min={0.1} max={3} step={0.1} />
                        <SettingSlider label="Stamina Drain" value={config.playerStaminaDrainMultiplier} onChange={v => updateConfig('playerStaminaDrainMultiplier', v)} min={0.1} max={3} step={0.1} />
                    </div>
                )}

                {activeCategory === 'dino' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="Dino Damage" value={config.dinoDamageMultiplier} onChange={v => updateConfig('dinoDamageMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Dino Resistance" value={config.dinoResistanceMultiplier} onChange={v => updateConfig('dinoResistanceMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Dino Food Drain" value={config.dinoFoodDrainMultiplier} onChange={v => updateConfig('dinoFoodDrainMultiplier', v)} min={0.1} max={3} step={0.1} />
                        <SettingSlider label="Wild Dino Count" value={config.wildDinoCountMultiplier} onChange={v => updateConfig('wildDinoCountMultiplier', v)} min={0.1} max={3} step={0.1} />
                    </div>
                )}

                {activeCategory === 'breeding' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="Egg Hatch Speed" value={config.eggHatchSpeedMultiplier} onChange={v => updateConfig('eggHatchSpeedMultiplier', v)} min={1} max={100} step={1} />
                        <SettingSlider label="Baby Mature Speed" value={config.babyMatureSpeedMultiplier} onChange={v => updateConfig('babyMatureSpeedMultiplier', v)} min={1} max={100} step={1} />
                        <SettingSlider label="Baby Food Consumption" value={config.babyFoodConsumptionMultiplier} onChange={v => updateConfig('babyFoodConsumptionMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Mating Interval" value={config.matingIntervalMultiplier} onChange={v => updateConfig('matingIntervalMultiplier', v)} min={0.01} max={1} step={0.01} description="Lower = faster" />
                    </div>
                )}

                {activeCategory === 'structure' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="Structure Damage" value={config.structureDamageMultiplier} onChange={v => updateConfig('structureDamageMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Structure Resistance" value={config.structureResistanceMultiplier} onChange={v => updateConfig('structureResistanceMultiplier', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Structure Decay" value={config.structureDecayMultiplier} onChange={v => updateConfig('structureDecayMultiplier', v)} min={0.1} max={5} step={0.1} />
                    </div>
                )}

                {activeCategory === 'daynight' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingSlider label="Day Cycle Speed" value={config.dayCycleSpeedScale} onChange={v => updateConfig('dayCycleSpeedScale', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Day Time Speed" value={config.dayTimeSpeedScale} onChange={v => updateConfig('dayTimeSpeedScale', v)} min={0.1} max={5} step={0.1} />
                        <SettingSlider label="Night Time Speed" value={config.nightTimeSpeedScale} onChange={v => updateConfig('nightTimeSpeedScale', v)} min={0.1} max={5} step={0.1} />
                    </div>
                )}
            </div>

            {/* Save Button */}
            {installPath && (
                <div className="flex justify-end">
                    <button
                        onClick={saveConfig}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        {isSaving ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Save className="w-5 h-5" />
                        )}
                        Save Configuration
                    </button>
                </div>
            )}

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Configuration Preview</h3>
                            <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-white/10 rounded-lg">
                                ✕
                            </button>
                        </div>
                        <pre className="p-4 text-sm text-slate-300 font-mono overflow-auto max-h-[60vh]">
                            {previewContent}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Components
function SettingSlider({ label, value, onChange, min, max, step, description }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step: number;
    description?: string;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">{label}</label>
                {description && <span className="text-xs text-slate-500">{description}</span>}
            </div>
            <div className="flex items-center gap-3">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value) || min)}
                    className="w-20 px-3 py-1.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-center font-mono text-sm"
                />
            </div>
        </div>
    );
}

function SettingInput({ label, value, onChange, placeholder }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">{label}</label>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
        </div>
    );
}

function SettingToggle({ label, value, onChange, description }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    description?: string;
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <label className="text-sm font-medium text-slate-300">{label}</label>
                {description && <p className="text-xs text-slate-500">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!value)}
                className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    value ? "bg-emerald-500" : "bg-slate-700"
                )}
            >
                <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    value ? "translate-x-6" : "translate-x-1"
                )} />
            </button>
        </div>
    );
}
