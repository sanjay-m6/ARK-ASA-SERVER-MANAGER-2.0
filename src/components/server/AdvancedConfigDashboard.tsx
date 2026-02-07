import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Save, Calendar, Layers, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types aligning with Backend
interface EventProfile {
    id?: number;
    server_id: number;
    profile_name: string;
    harvest_multiplier: number;
    stack_size_multiplier: number;
    structure_resistance: number;
    structure_damage: number;
    is_active: boolean;
}

interface TransferPolicy {
    id?: number;
    server_id: number;
    item_whitelist: string;
    dino_whitelist: string;
    max_quantity: number;
    enabled: boolean;
}

interface AdvancedConfigDashboardProps {
    serverId: number | null;
}

export default function AdvancedConfigDashboard({ serverId }: AdvancedConfigDashboardProps) {
    const [profiles, setProfiles] = useState<EventProfile[]>([]);
    const [activeTab, setActiveTab] = useState<'event' | 'structure' | 'transfer'>('event');
    const [isLoading, setIsLoading] = useState(false);

    // Transfer Policy State
    const [transferPolicy, setTransferPolicy] = useState<TransferPolicy | null>(null);

    // Editing State (Event Profile)
    const [currentProfile, setCurrentProfile] = useState<EventProfile>({
        server_id: serverId || 0,
        profile_name: 'New Event Profile',
        harvest_multiplier: 1.0,
        stack_size_multiplier: 1.0,
        structure_resistance: 1.0,
        structure_damage: 1.0,
        is_active: false
    });

    useEffect(() => {
        if (!serverId) return;
        loadData();
    }, [serverId]);

    const loadData = async () => {
        if (!serverId) return;
        setIsLoading(true);
        try {
            // Load Profiles
            const profiles: EventProfile[] = await invoke('get_event_profiles', { serverId });
            setProfiles(profiles);

            // Set active profile if exists
            const active = profiles.find(p => p.is_active);
            if (active) {
                setCurrentProfile(active);
            } else if (profiles.length > 0) {
                setCurrentProfile({ ...profiles[0], is_active: false });
            }

            // Load Transfer Policy
            const policy: TransferPolicy | null = await invoke('get_transfer_policy', { serverId });
            if (policy) {
                setTransferPolicy(policy);
            } else {
                setTransferPolicy({
                    server_id: serverId,
                    item_whitelist: '',
                    dino_whitelist: '',
                    max_quantity: 100,
                    enabled: false
                });
            }
        } catch (error) {
            console.error("Failed to load advanced config:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSavePolicy = async () => {
        if (!transferPolicy) return;
        setIsLoading(true);
        try {
            await invoke('save_transfer_policy', { policy: transferPolicy });
        } catch (error) {
            console.error("Failed to save policy:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!serverId) return;
        setIsLoading(true);
        try {
            const profileToSave = { ...currentProfile, server_id: serverId };
            const id = await invoke<number>('save_event_profile', { profile: profileToSave });
            setCurrentProfile({ ...currentProfile, id });
            // Reload to refresh list
            const profiles: EventProfile[] = await invoke('get_event_profiles', { serverId });
            setProfiles(profiles);
        } catch (error) {
            console.error('Failed to save profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleEventMode = async (enable: boolean) => {
        if (!serverId) return;
        setIsLoading(true);
        try {
            if (enable) {
                let pid = currentProfile.id;
                if (!pid) {
                    pid = await invoke<number>('save_event_profile', { profile: { ...currentProfile, server_id: serverId } });
                    setCurrentProfile({ ...currentProfile, id: pid });
                }
                await invoke('activate_event_profile', { serverId, profileId: pid });
            } else {
                await invoke('activate_event_profile', { serverId, profileId: null });
            }
            // Reload data
            loadData();
        } catch (error) {
            console.error('Failed to toggle event mode:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!serverId) return <div className="p-8 text-center text-slate-500">Select a server to configure advanced settings.</div>;

    const isActive = profiles.some(p => p.id === currentProfile.id && p.is_active);

    return (
        <div className="flex flex-col h-full gap-6 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                        Advanced Configuration
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Configure event multipliers, structure limits, and transfer policies.
                    </p>
                </div>
                <div className="bg-[#1a1a2e] px-4 py-2 rounded-xl border border-slate-700/50 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-medium">Server ID: {serverId}</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-700/50">
                <button
                    onClick={() => setActiveTab('event')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'event'
                        ? 'text-violet-400 border-violet-400'
                        : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                >
                    Event Profiles
                </button>
                <button
                    onClick={() => setActiveTab('structure')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'structure'
                        ? 'text-violet-400 border-violet-400'
                        : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                >
                    Structure Overrides
                </button>
                <button
                    onClick={() => setActiveTab('transfer')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'transfer'
                        ? 'text-violet-400 border-violet-400'
                        : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                >
                    Transfer Policy
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-2">
                <AnimatePresence mode="wait">
                    {/* Event Content */}
                    {activeTab === 'event' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            {/* Control Panel */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className={`p-6 rounded-2xl border ${isActive ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700/50'}`}>
                                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                        <Power className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                                        Event Mode Status
                                    </h3>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className={`text-sm font-semibold ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}>
                                            {isActive ? 'ACTIVE • Live on Server' : 'INACTIVE • Standard Config'}
                                        </span>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={isActive}
                                                onChange={(e) => toggleEventMode(e.target.checked)}
                                                className="sr-only peer"
                                                disabled={isLoading}
                                            />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                        When active, these settings <strong>OVERRIDE</strong> your base server configuration.
                                        Disabling will revert to standard Game.ini settings.
                                    </p>
                                </div>

                                <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                                    <label className="block text-slate-400 text-sm font-bold mb-2">Profile Name</label>
                                    <input
                                        type="text"
                                        value={currentProfile.profile_name}
                                        onChange={(e) => setCurrentProfile({ ...currentProfile, profile_name: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 outline-none"
                                    />
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={isLoading}
                                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Save className="w-4 h-4" />
                                            Save Profile
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Settings Panel */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-indigo-400" />
                                        Economic & Structure Multipliers
                                    </h3>

                                    <div className="space-y-8">
                                        {/* Harvest */}
                                        <div>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-slate-300 font-medium">Harvest Amount</span>
                                                <span className="text-indigo-400 font-mono font-bold">{currentProfile.harvest_multiplier.toFixed(1)}x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="100.0"
                                                step="0.5"
                                                value={currentProfile.harvest_multiplier}
                                                onChange={(e) => setCurrentProfile({ ...currentProfile, harvest_multiplier: parseFloat(e.target.value) })}
                                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                            />
                                        </div>

                                        {/* Stack Size */}
                                        <div>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-slate-300 font-medium">Inventory Stack Size</span>
                                                <span className="text-indigo-400 font-mono font-bold">{currentProfile.stack_size_multiplier.toFixed(1)}x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="50.0"
                                                step="0.5"
                                                value={currentProfile.stack_size_multiplier}
                                                onChange={(e) => setCurrentProfile({ ...currentProfile, stack_size_multiplier: parseFloat(e.target.value) })}
                                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Acts as a global multiplier for item stack sizes. Increases effective slot capacity.</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8">
                                            {/* Structure Resistance */}
                                            <div>
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-slate-300 font-medium">Struct. Resistance</span>
                                                    <span className="text-emerald-400 font-mono font-bold">{currentProfile.structure_resistance.toFixed(2)}x</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0.01"
                                                    max="5.0"
                                                    step="0.1"
                                                    value={currentProfile.structure_resistance}
                                                    onChange={(e) => setCurrentProfile({ ...currentProfile, structure_resistance: parseFloat(e.target.value) })}
                                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Lower = Stronger Structures (0.5 = 2x Health)</p>
                                            </div>

                                            {/* Structure Damage */}
                                            <div>
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-slate-300 font-medium">Struct. Damage</span>
                                                    <span className="text-red-400 font-mono font-bold">{currentProfile.structure_damage.toFixed(2)}x</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0.1"
                                                    max="10.0"
                                                    step="0.1"
                                                    value={currentProfile.structure_damage}
                                                    onChange={(e) => setCurrentProfile({ ...currentProfile, structure_damage: parseFloat(e.target.value) })}
                                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Damage dealt by Spikes/Turrets.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Structure Content */}
                    {activeTab === 'structure' && (
                        <div className="text-center p-12 text-slate-500 bg-slate-800/30 rounded-2xl border border-slate-700/50">
                            <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-bold">Structure Overrides</h3>
                            <p>Specific resistance overrides per-structure ID are not yet implemented due to INI limitations.</p>
                            <p className="text-sm mt-2">Use Global Structure Resistance in "Event Mode" tab for general balancing.</p>
                        </div>
                    )}

                    {/* Transfer Content */}
                    {activeTab === 'transfer' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="max-w-4xl space-y-6"
                        >
                            {/* Enable Toggle */}
                            <div className="bg-[#151525] p-6 rounded-2xl border border-slate-700/50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Enable Custom Transfer Policy</h3>
                                    <p className="text-slate-400 text-sm">Enforce whitelists and limits for item/dino transfers.</p>
                                </div>
                                <button
                                    onClick={() => transferPolicy && setTransferPolicy({ ...transferPolicy, enabled: !transferPolicy.enabled })}
                                    className={`relative w-14 h-8 rounded-full transition-colors ${transferPolicy?.enabled ? 'bg-violet-600' : 'bg-slate-700'
                                        }`}
                                >
                                    <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${transferPolicy?.enabled ? 'translate-x-6' : 'translate-x-0'
                                        }`} />
                                </button>
                            </div>

                            {/* Whitelists */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-[#151525] p-6 rounded-2xl border border-slate-700/50">
                                    <h3 className="text-lg font-semibold text-white mb-4">Item Whitelist</h3>
                                    <p className="text-xs text-slate-500 mb-2">Comma-separated Blueprint Paths or Item Names</p>
                                    <textarea
                                        value={transferPolicy?.item_whitelist || ''}
                                        onChange={(e) => transferPolicy && setTransferPolicy({ ...transferPolicy, item_whitelist: e.target.value })}
                                        className="w-full h-64 bg-[#0d0d1a] border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:border-violet-500 focus:outline-none resize-none"
                                        placeholder="Cheat_Item_Path_1, Cheat_Item_Path_2..."
                                        disabled={!transferPolicy?.enabled}
                                    />
                                </div>
                                <div className="bg-[#151525] p-6 rounded-2xl border border-slate-700/50">
                                    <h3 className="text-lg font-semibold text-white mb-4">Dino Whitelist</h3>
                                    <p className="text-xs text-slate-500 mb-2">Comma-separated Dino Character BPs</p>
                                    <textarea
                                        value={transferPolicy?.dino_whitelist || ''}
                                        onChange={(e) => transferPolicy && setTransferPolicy({ ...transferPolicy, dino_whitelist: e.target.value })}
                                        className="w-full h-64 bg-[#0d0d1a] border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:border-violet-500 focus:outline-none resize-none"
                                        placeholder="Rex_Character_BP_C, Arg_Character_BP_C..."
                                        disabled={!transferPolicy?.enabled}
                                    />
                                </div>
                            </div>

                            {/* Limits */}
                            <div className="bg-[#151525] p-6 rounded-2xl border border-slate-700/50">
                                <h3 className="text-lg font-semibold text-white mb-4">Transfer Limits</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-slate-400">Max Item Quantity per Transfer</span>
                                            <span className="text-violet-400 font-mono">{transferPolicy?.max_quantity || 100}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="1000"
                                            value={transferPolicy?.max_quantity || 100}
                                            onChange={(e) => transferPolicy && setTransferPolicy({ ...transferPolicy, max_quantity: parseInt(e.target.value) })}
                                            className="w-full accent-violet-500"
                                            disabled={!transferPolicy?.enabled}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSavePolicy}
                                    disabled={isLoading}
                                    className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Policy
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
