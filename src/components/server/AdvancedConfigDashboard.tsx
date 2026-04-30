import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Save, Calendar, Layers, Power, Loader2, Shield, ArrowRightLeft, Trash2, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

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

// Reusable slider with visual feedback
function MultiplierSlider({ label, value, onChange, min, max, step, description, color = 'indigo', suffix = 'x' }: {
    label: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step: number; description?: string;
    color?: 'indigo' | 'emerald' | 'red' | 'amber'; suffix?: string;
}) {
    const colorMap = {
        indigo: { text: 'text-indigo-400', accent: 'accent-indigo-500', bg: 'bg-indigo-500', glow: 'shadow-indigo-500/30' },
        emerald: { text: 'text-emerald-400', accent: 'accent-emerald-500', bg: 'bg-emerald-500', glow: 'shadow-emerald-500/30' },
        red: { text: 'text-red-400', accent: 'accent-red-500', bg: 'bg-red-500', glow: 'shadow-red-500/30' },
        amber: { text: 'text-amber-400', accent: 'accent-amber-500', bg: 'bg-amber-500', glow: 'shadow-amber-500/30' },
    };
    const c = colorMap[color];
    const pct = Math.min(((value - min) / (max - min)) * 100, 100);

    return (
        <div className="group">
            <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-300 font-medium">{label}</span>
                <div className="flex items-center gap-2">
                    <input
                        type="number" min={min} max={max} step={step} value={value}
                        onChange={e => onChange(parseFloat(e.target.value) || min)}
                        className={`w-20 bg-slate-900/80 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-sm ${c.text} focus:outline-none focus:border-indigo-500`}
                    />
                    <span className={`${c.text} font-mono font-bold text-xs`}>{suffix}</span>
                </div>
            </div>
            <div className="relative h-2 bg-slate-700/60 rounded-full overflow-hidden">
                <div className={`absolute inset-y-0 left-0 ${c.bg} rounded-full transition-all duration-200`} style={{ width: `${pct}%` }} />
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className={`w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer ${c.accent} -mt-2 relative z-10 opacity-0 hover:opacity-100`}
            />
            {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
        </div>
    );
}

export default function AdvancedConfigDashboard({ serverId }: AdvancedConfigDashboardProps) {
    const [profiles, setProfiles] = useState<EventProfile[]>([]);
    const [activeTab, setActiveTab] = useState<'event' | 'structure' | 'transfer'>('event');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [transferPolicy, setTransferPolicy] = useState<TransferPolicy | null>(null);
    const [currentProfile, setCurrentProfile] = useState<EventProfile>({
        server_id: serverId || 0, profile_name: 'New Event Profile',
        harvest_multiplier: 1.0, stack_size_multiplier: 1.0,
        structure_resistance: 1.0, structure_damage: 1.0, is_active: false
    });

    useEffect(() => { if (serverId) loadData(); }, [serverId]);

    const loadData = async () => {
        if (!serverId) return;
        setIsLoading(true);
        try {
            const profs: EventProfile[] = await invoke('get_event_profiles', { serverId });
            setProfiles(profs);
            const active = profs.find(p => p.is_active);
            if (active) setCurrentProfile(active);
            else if (profs.length > 0) setCurrentProfile({ ...profs[0], is_active: false });

            const policy: TransferPolicy | null = await invoke('get_transfer_policy', { serverId });
            setTransferPolicy(policy || { server_id: serverId, item_whitelist: '', dino_whitelist: '', max_quantity: 100, enabled: false });
        } catch (error) {
            console.error("Failed to load advanced config:", error);
            toast.error('Failed to load configuration');
        } finally { setIsLoading(false); }
    };

    const handleSavePolicy = async () => {
        if (!transferPolicy) return;
        setIsSaving(true);
        try {
            await invoke('save_transfer_policy', { policy: transferPolicy });
            toast.success('Transfer policy saved');
        } catch (error) {
            console.error("Failed to save policy:", error);
            toast.error('Failed to save policy');
        } finally { setIsSaving(false); }
    };

    const handleSaveProfile = async () => {
        if (!serverId) return;
        setIsSaving(true);
        try {
            const profileToSave = { ...currentProfile, server_id: serverId };
            const id = await invoke<number>('save_event_profile', { profile: profileToSave });
            setCurrentProfile({ ...currentProfile, id });
            const profs: EventProfile[] = await invoke('get_event_profiles', { serverId });
            setProfiles(profs);
            toast.success('Profile saved');
        } catch (error) {
            console.error('Failed to save profile:', error);
            toast.error('Failed to save profile');
        } finally { setIsSaving(false); }
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
            toast.success(enable ? 'Event mode activated' : 'Event mode deactivated');
            loadData();
        } catch (error) {
            console.error('Failed to toggle event mode:', error);
            toast.error('Failed to toggle event mode');
        } finally { setIsLoading(false); }
    };

    const createNewProfile = () => {
        setCurrentProfile({
            server_id: serverId || 0, profile_name: `Event Profile ${profiles.length + 1}`,
            harvest_multiplier: 2.0, stack_size_multiplier: 1.0,
            structure_resistance: 1.0, structure_damage: 1.0, is_active: false
        });
    };

    if (!serverId) return (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-40" />
            <p className="text-lg font-medium">Select a server to configure advanced settings</p>
        </div>
    );

    const isActive = profiles.some(p => p.id === currentProfile.id && p.is_active);

    const tabs = [
        { id: 'event' as const, label: 'Event Profiles', icon: Calendar, color: 'from-indigo-600 to-violet-600' },
        { id: 'structure' as const, label: 'Structure Overrides', icon: Shield, color: 'from-emerald-600 to-teal-600' },
        { id: 'transfer' as const, label: 'Transfer Policy', icon: ArrowRightLeft, color: 'from-amber-600 to-orange-600' },
    ];

    return (
        <div className="flex flex-col h-full gap-6 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                        Advanced Configuration
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Configure event multipliers, structure limits, and transfer policies</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-[#1a1a2e] px-4 py-2 rounded-xl border border-slate-700/50 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-medium">Server ID: {serverId}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#0d0d1a] p-1.5 rounded-xl border border-slate-800/50 self-start">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2.5 text-sm font-medium transition-all duration-300 rounded-lg flex items-center gap-2 ${
                                activeTab === tab.id
                                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }`}
                        >
                            <Icon className="w-4 h-4" />{tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-2">
                <AnimatePresence mode="wait">
                    {/* ── EVENT PROFILES ── */}
                    {activeTab === 'event' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            {/* Left Panel: Status + Profile Selector */}
                            <div className="lg:col-span-1 space-y-4">
                                {/* Status Card */}
                                <div className={`p-5 rounded-2xl border-2 transition-all duration-300 ${
                                    isActive ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/30 border-slate-700/50'
                                }`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                                            <Power className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                                            Event Mode
                                        </h3>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={isActive} onChange={e => toggleEventMode(e.target.checked)}
                                                className="sr-only peer" disabled={isLoading} />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                                        </label>
                                    </div>
                                    <div className={`flex items-center gap-2 text-xs font-semibold mb-3 ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}>
                                        {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                                        {isActive ? 'ACTIVE • Live on Server' : 'INACTIVE • Standard Config'}
                                    </div>
                                    <p className="text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                        When active, these settings <strong>OVERRIDE</strong> your base server configuration. Disabling reverts to standard settings.
                                    </p>
                                </div>

                                {/* Profile List */}
                                <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
                                    <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-300">Saved Profiles</h4>
                                        <button onClick={createNewProfile}
                                            className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
                                            title="New Profile"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto">
                                        {profiles.length === 0 ? (
                                            <p className="p-4 text-xs text-slate-500 text-center">No profiles yet. Create one below.</p>
                                        ) : profiles.map(p => (
                                            <button key={p.id} onClick={() => setCurrentProfile(p)}
                                                className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-slate-800/50 last:border-0 flex items-center justify-between ${
                                                    currentProfile.id === p.id ? 'bg-indigo-500/10 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                                }`}
                                            >
                                                <span className="truncate">{p.profile_name}</span>
                                                {p.is_active && <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full font-bold">LIVE</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Profile Name Editor */}
                                <div className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-2xl space-y-3">
                                    <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider">Profile Name</label>
                                    <input type="text" value={currentProfile.profile_name}
                                        onChange={e => setCurrentProfile({ ...currentProfile, profile_name: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors"
                                    />
                                    <button onClick={handleSaveProfile} disabled={isSaving}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                                    >
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save Profile
                                    </button>
                                </div>
                            </div>

                            {/* Right Panel: Multipliers */}
                            <div className="lg:col-span-2">
                                <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl space-y-6">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-indigo-400" />
                                        Economic & Structure Multipliers
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                        <MultiplierSlider label="Harvest Amount" value={currentProfile.harvest_multiplier}
                                            onChange={v => setCurrentProfile({ ...currentProfile, harvest_multiplier: v })}
                                            min={1} max={100} step={0.5} color="indigo" description="Multiplies resource yield from harvesting" />
                                        <MultiplierSlider label="Inventory Stack Size" value={currentProfile.stack_size_multiplier}
                                            onChange={v => setCurrentProfile({ ...currentProfile, stack_size_multiplier: v })}
                                            min={1} max={50} step={0.5} color="amber" description="Global multiplier for item stack sizes" />
                                        <MultiplierSlider label="Structure Resistance" value={currentProfile.structure_resistance}
                                            onChange={v => setCurrentProfile({ ...currentProfile, structure_resistance: v })}
                                            min={0.01} max={5} step={0.1} color="emerald" description="Lower = Stronger (0.5 = 2x Health)" />
                                        <MultiplierSlider label="Structure Damage" value={currentProfile.structure_damage}
                                            onChange={v => setCurrentProfile({ ...currentProfile, structure_damage: v })}
                                            min={0.1} max={10} step={0.1} color="red" description="Damage dealt by Spikes/Turrets" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── STRUCTURE OVERRIDES ── */}
                    {activeTab === 'structure' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-8 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                                    <Shield className="w-8 h-8 text-emerald-400 opacity-60" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Structure Overrides</h3>
                                <p className="text-slate-400 text-sm max-w-md mx-auto mb-4">
                                    Per-structure resistance overrides are not yet implemented due to ARK INI limitations.
                                </p>
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 max-w-md mx-auto">
                                    <p className="text-xs text-emerald-300/80 flex items-center justify-center gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Use <strong>Global Structure Resistance</strong> in the Event Profiles tab for general balancing.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── TRANSFER POLICY ── */}
                    {activeTab === 'transfer' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="space-y-5 max-w-5xl"
                        >
                            {/* Enable Toggle */}
                            <div className="bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-white">Enable Custom Transfer Policy</h3>
                                    <p className="text-slate-400 text-sm mt-0.5">Enforce whitelists and limits for item/dino transfers</p>
                                </div>
                                <button onClick={() => transferPolicy && setTransferPolicy({ ...transferPolicy, enabled: !transferPolicy.enabled })}
                                    className={`relative w-14 h-8 rounded-full transition-colors ${transferPolicy?.enabled ? 'bg-amber-600' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform shadow-lg ${
                                        transferPolicy?.enabled ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>

                            {/* Whitelists */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className={`bg-slate-800/30 p-5 rounded-2xl border transition-all ${
                                    transferPolicy?.enabled ? 'border-amber-500/30' : 'border-slate-700/50 opacity-60'
                                }`}>
                                    <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-amber-400" /> Item Whitelist
                                    </h3>
                                    <p className="text-xs text-slate-500 mb-3">Comma-separated Blueprint Paths or Item Names</p>
                                    <textarea value={transferPolicy?.item_whitelist || ''}
                                        onChange={e => transferPolicy && setTransferPolicy({ ...transferPolicy, item_whitelist: e.target.value })}
                                        className="w-full h-48 bg-[#0d0d1a] border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:border-amber-500 focus:outline-none resize-none font-mono"
                                        placeholder="PrimalItemResource_Metal_C&#10;PrimalItemResource_Polymer_C"
                                        disabled={!transferPolicy?.enabled}
                                    />
                                </div>
                                <div className={`bg-slate-800/30 p-5 rounded-2xl border transition-all ${
                                    transferPolicy?.enabled ? 'border-amber-500/30' : 'border-slate-700/50 opacity-60'
                                }`}>
                                    <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-amber-400" /> Dino Whitelist
                                    </h3>
                                    <p className="text-xs text-slate-500 mb-3">Comma-separated Dino Character BPs</p>
                                    <textarea value={transferPolicy?.dino_whitelist || ''}
                                        onChange={e => transferPolicy && setTransferPolicy({ ...transferPolicy, dino_whitelist: e.target.value })}
                                        className="w-full h-48 bg-[#0d0d1a] border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:border-amber-500 focus:outline-none resize-none font-mono"
                                        placeholder="Rex_Character_BP_C&#10;Argent_Character_BP_C"
                                        disabled={!transferPolicy?.enabled}
                                    />
                                </div>
                            </div>

                            {/* Transfer Limits */}
                            <div className={`bg-slate-800/30 p-5 rounded-2xl border transition-all ${
                                transferPolicy?.enabled ? 'border-amber-500/30' : 'border-slate-700/50 opacity-60'
                            }`}>
                                <MultiplierSlider label="Max Item Quantity per Transfer" value={transferPolicy?.max_quantity || 100}
                                    onChange={v => transferPolicy && setTransferPolicy({ ...transferPolicy, max_quantity: Math.round(v) })}
                                    min={1} max={1000} step={1} color="amber" suffix="" description="Maximum number of items allowed per transfer action"
                                />
                            </div>

                            <div className="flex justify-end">
                                <button onClick={handleSavePolicy} disabled={isSaving}
                                    className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
