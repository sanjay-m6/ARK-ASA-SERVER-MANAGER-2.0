import { useState, useEffect, useRef } from 'react';
import { 
    Flame, 
    Shield, 
    Layers, 
    Palette, 
    Type, 
    Activity, 
    AlertOctagon, 
    Heart, 
    Sparkles, 
    FileJson, 
    Gauge, 
    BarChart3, 
    Settings, 
    Plus, 
    Loader2, 
    Check, 
    Download, 
    Eye,
    Trash2,
    RefreshCw,
    ChevronDown
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { 
    getAllServers,
    getInfinityDamageConfig, 
    saveInfinityDamageConfig, 
    installInfinityDamagePlugin, 
    uninstallInfinityDamagePlugin, 
    exportInfinityDamageConfig, 
    importInfinityDamageConfig, 
    getInfinityDamageAnalytics 
} from '../../utils/tauri';
import ServerSelect from '../../components/ui/ServerSelect';
import toast from 'react-hot-toast';
import { 
    AreaChart, 
    Area, 
    BarChart,
    Bar,
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer 
} from 'recharts';

interface CategoryConfig {
    Color: string;
    Size: number;
    Font: string;
    Weight: string;
    Lifetime: number;
    Animation: string;
    Glow: boolean;
    Outline: boolean;
    Sound?: string;
    Particle?: string;
}

interface DamageConfig {
    Branding: {
        PluginName: string;
        Developer: string;
        LicenseType: string;
        LicensedTo: string;
        ValidationToken: string;
    };
    General: {
        EnablePlugin: boolean;
        NumberFormat: string;
        GlobalTextSizeMultiplier: number;
        GlobalLifetimeMultiplier: number;
        EnablePerformanceMode: boolean;
    };
    Categories: Record<string, CategoryConfig>;
    CriticalHits: {
        Threshold: number;
        Color: string;
        SizeMultiplier: number;
        ParticleEffect: string;
        ScreenFlash: boolean;
        ScreenShake: boolean;
        SoundEffect: string;
    };
    Animations: {
        GlobalSpeed: number;
        FloatHeight: number;
        BounceStrength: number;
        FadeDuration: number;
        ScaleDuration: number;
        RotationAngle: number;
    };
    Performance: {
        MaxVisibleNumbers: number;
        AutoCleanupThreshold: number;
        DistanceCullingRange: number;
        DynamicScalingEnabled: boolean;
        PerformanceMode: string;
    };
    ResourceColors?: Record<string, string>;
    RarityColors?: Record<string, string>;
}

interface FloatingText {
    id: number;
    text: string;
    x: number;
    y: number;
    color: string;
    size: number;
    font: string;
    weight: string;
    glow: boolean;
    outline: boolean;
    animation: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (val: string) => void;
    options: { value: string; label: string }[];
    className?: string;
}

function CustomSelect({ value, onChange, options, className }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentOption = options.find(o => o.value === value) || options[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1 bg-slate-950 border border-slate-700/60 hover:border-slate-500 rounded text-xs text-slate-300 focus:outline-none transition-colors cursor-pointer min-w-[120px] h-[28px]"
            >
                <span className="truncate">{currentOption?.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-1 w-full min-w-[150px] bg-slate-950 border border-white/10 rounded-lg shadow-2xl z-50 p-1 max-h-60 overflow-y-auto scrollbar-thin backdrop-blur-2xl">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded text-[11px] font-bold uppercase transition-all cursor-pointer",
                                opt.value === value
                                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/10"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

interface CustomColorPickerProps {
    value: string;
    onChange: (val: string) => void;
    className?: string;
}

function CustomColorPicker({ value, onChange, className }: CustomColorPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const presets = [
        '#EF4444', '#F97316', '#F59E0B', '#10B981', 
        '#06B6D4', '#3B82F6', '#0EA5E9', '#14B8A6', 
        '#EC4899', '#F43F5E', '#FFFFFF', '#94A3B8',
        '#64748B', '#475569', '#334155', '#1E293B'
    ];

    const hexToRgb = (hexStr: string) => {
        const clean = hexStr.replace(/^#/, '');
        if (clean.length === 3) {
            const r = parseInt(clean[0] + clean[0], 16);
            const g = parseInt(clean[1] + clean[1], 16);
            const b = parseInt(clean[2] + clean[2], 16);
            return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
        }
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
    };

    const rgbToHex = (r: number, g: number, b: number) => {
        const toHex = (c: number) => {
            const val = Math.max(0, Math.min(255, Math.round(c)));
            const hex = val.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    };

    const { r, g, b } = hexToRgb(value || '#FFFFFF');

    const handleRgbChange = (channel: 'r' | 'g' | 'b', val: number) => {
        const newRgb = { r, g, b, [channel]: val };
        const newHex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
        onChange(newHex.toUpperCase());
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative inline-block shrink-0">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "overflow-hidden border border-white/10 bg-slate-950 shrink-0 cursor-pointer block relative focus:outline-none hover:scale-105 active:scale-95 transition-all shadow-md",
                    className
                )}
                style={{ backgroundColor: value || '#FFFFFF' }}
                title="Open color picker GUI"
            />

            {isOpen && (
                <div className="absolute left-0 mt-2 p-3 bg-slate-950 border border-white/10 rounded-xl shadow-2xl z-50 space-y-3 w-[220px] text-left animate-fadeIn backdrop-blur-2xl">
                    <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">Swatches Presets</span>
                        <div className="grid grid-cols-8 gap-1">
                            {presets.map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => {
                                        onChange(p);
                                    }}
                                    className={cn(
                                        "w-4 h-4 rounded border border-white/5 cursor-pointer transition-transform hover:scale-110 active:scale-90",
                                        p === value.toUpperCase() && "ring-1 ring-cyan-500 border-white/20 scale-105"
                                    )}
                                    style={{ backgroundColor: p }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5 border-t border-white/5 pt-1.5">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">Custom RGB Adjust</span>
                        
                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-red-500 w-2.5 font-mono">R</span>
                            <input
                                type="range"
                                min="0"
                                max="255"
                                value={r}
                                onChange={(e) => handleRgbChange('r', parseInt(e.target.value))}
                                className="flex-1 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-red-500"
                            />
                            <span className="text-[9px] text-slate-400 w-5 text-right font-mono">{r}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-emerald-500 w-2.5 font-mono">G</span>
                            <input
                                type="range"
                                min="0"
                                max="255"
                                value={g}
                                onChange={(e) => handleRgbChange('g', parseInt(e.target.value))}
                                className="flex-1 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <span className="text-[9px] text-slate-400 w-5 text-right font-mono">{g}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-blue-500 w-2.5 font-mono">B</span>
                            <input
                                type="range"
                                min="0"
                                max="255"
                                value={b}
                                onChange={(e) => handleRgbChange('b', parseInt(e.target.value))}
                                className="flex-1 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <span className="text-[9px] text-slate-400 w-5 text-right font-mono">{b}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 border-t border-white/5 pt-1.5">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">HEX</span>
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onChange(e.target.value.toUpperCase())}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white uppercase font-mono focus:outline-none focus:border-cyan-500"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function InfinityDamage() {
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [isInstalled, setIsInstalled] = useState<boolean>(false);
    const [config, setConfig] = useState<DamageConfig | null>(null);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<string>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isInstalling, setIsInstalling] = useState<boolean>(false);
    const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
    const [previewCategory, setPreviewCategory] = useState<string>('WildCreatures');
    const [previewValue, setPreviewValue] = useState<string>('125000');
    const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');

    // Export / Import states
    const [exportFormat, setExportFormat] = useState<string>('json');
    const [importFormat, setImportFormat] = useState<string>('json');
    const [importContent, setImportContent] = useState<string>('');

    // Custom presets & backups state
    const [customPresets, setCustomPresets] = useState<{ id: string; name: string; config: DamageConfig }[]>([]);
    const [backups, setBackups] = useState<{ id: string; name: string; timestamp: string; config: DamageConfig }[]>([]);
    const [newPresetName, setNewPresetName] = useState<string>('');
    const [newBackupName, setNewBackupName] = useState<string>('');

    // Load servers
    useEffect(() => {
        loadServers();
    }, []);

    // Load plugin config when server selection changes
    useEffect(() => {
        if (selectedServerId) {
            checkPluginInstallation();
            loadAnalytics();
            loadCustomPresets();
            loadBackups();
        } else {
            setIsInstalled(false);
            setConfig(null);
        }
    }, [selectedServerId]);

    const loadCustomPresets = () => {
        try {
            const raw = localStorage.getItem('infinity_damage_custom_presets');
            if (raw) {
                setCustomPresets(JSON.parse(raw));
            } else {
                setCustomPresets([]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const saveCustomPreset = (name: string) => {
        if (!config || !name.trim()) return;
        const newPreset = {
            id: Date.now().toString(),
            name: name.trim(),
            config: JSON.parse(JSON.stringify(config)) as DamageConfig
        };
        const updated = [...customPresets, newPreset];
        localStorage.setItem('infinity_damage_custom_presets', JSON.stringify(updated));
        setCustomPresets(updated);
        setNewPresetName('');
        toast.success(`Custom preset "${name}" saved!`);
    };

    const deleteCustomPreset = (id: string) => {
        const updated = customPresets.filter(p => p.id !== id);
        localStorage.setItem('infinity_damage_custom_presets', JSON.stringify(updated));
        setCustomPresets(updated);
        toast.success('Custom preset deleted');
    };

    const loadBackups = () => {
        if (!selectedServerId) return;
        try {
            const raw = localStorage.getItem(`infinity_damage_backups_${selectedServerId}`);
            if (raw) {
                setBackups(JSON.parse(raw));
            } else {
                setBackups([]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const createBackup = (name?: string) => {
        if (!config || !selectedServerId) return;
        const bName = name?.trim() || `Backup ${new Date().toLocaleString()}`;
        const newBackup = {
            id: Date.now().toString(),
            name: bName,
            timestamp: new Date().toLocaleString(),
            config: JSON.parse(JSON.stringify(config)) as DamageConfig
        };
        const updated = [...backups, newBackup];
        localStorage.setItem(`infinity_damage_backups_${selectedServerId}`, JSON.stringify(updated));
        setBackups(updated);
        setNewBackupName('');
        toast.success('Local backup profile created!');
    };

    const restoreBackup = (backupConfig: DamageConfig) => {
        setConfig(JSON.parse(JSON.stringify(backupConfig)));
        toast.success('Config loaded from backup! Remember to click "Save Configuration" at the top.');
    };

    const deleteBackup = (id: string) => {
        if (!selectedServerId) return;
        const updated = backups.filter(b => b.id !== id);
        localStorage.setItem(`infinity_damage_backups_${selectedServerId}`, JSON.stringify(updated));
        setBackups(updated);
        toast.success('Backup profile deleted');
    };

    const loadServers = async () => {
        try {
            const list = await getAllServers();
            if (list.length > 0 && !selectedServerId) {
                setSelectedServerId(list[0].id);
            }
        } catch (error) {
            console.error('Failed to load servers:', error);
            toast.error('Failed to load servers');
        }
    };

    const checkPluginInstallation = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const rawConfig = await getInfinityDamageConfig(selectedServerId);
            const parsed = JSON.parse(rawConfig) as DamageConfig;
            setConfig(parsed);
            setIsInstalled(true);
        } catch (error) {
            console.warn('Plugin not installed or corrupt:', error);
            setIsInstalled(false);
            setConfig(null);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAnalytics = async () => {
        if (!selectedServerId) return;
        try {
            const data = await getInfinityDamageAnalytics(selectedServerId);
            setAnalytics(data);
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    };

    const handleInstallPlugin = async () => {
        if (!selectedServerId) return;
        setIsInstalling(true);
        const toastId = toast.loading('Installing and validating Infinity Floating Damage System...');
        try {
            await installInfinityDamagePlugin(selectedServerId);
            toast.success('Infinity Floating Damage System verified and installed successfully!', { id: toastId });
            await checkPluginInstallation();
            await loadAnalytics();
        } catch (error) {
            console.error('Failed to install plugin:', error);
            toast.error(`Installation failed: ${error}`, { id: toastId });
        } finally {
            setIsInstalling(false);
        }
    };

    const handleUninstallPlugin = async () => {
        if (!selectedServerId) return;
        if (!confirm('Are you sure you want to completely uninstall the Infinity Floating Damage System? All configurations will be deleted.')) return;
        
        setIsInstalling(true);
        const toastId = toast.loading('Removing plugin files...');
        try {
            await uninstallInfinityDamagePlugin(selectedServerId);
            toast.success('Plugin removed successfully.', { id: toastId });
            setIsInstalled(false);
            setConfig(null);
        } catch (error) {
            console.error('Failed to remove plugin:', error);
            toast.error(`Uninstall failed: ${error}`, { id: toastId });
        } finally {
            setIsInstalling(false);
        }
    };

    const handleSaveConfig = async () => {
        if (!selectedServerId || !config) return;
        setIsSaving(true);
        const toastId = toast.loading('Saving plugin configurations...');
        try {
            await saveInfinityDamageConfig(selectedServerId, JSON.stringify(config, null, 2));
            toast.success('Configuration saved successfully!', { id: toastId });
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error(`Save failed: ${error}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = async () => {
        if (!selectedServerId) return;
        try {
            const data = await exportInfinityDamageConfig(selectedServerId, exportFormat);
            // Trigger browser download
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `infinity_damage_config.${exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Config exported in ${exportFormat.toUpperCase()} format`);
        } catch (error) {
            console.error('Export failed:', error);
            toast.error(`Export failed: ${error}`);
        }
    };

    const handleImport = async () => {
        if (!selectedServerId || !importContent.trim()) {
            toast.error('Please paste or select configuration content first');
            return;
        }
        setIsSaving(true);
        const toastId = toast.loading('Importing configuration...');
        try {
            await importInfinityDamageConfig(selectedServerId, importContent, importFormat);
            toast.success('Configuration imported successfully!', { id: toastId });
            await checkPluginInstallation();
            setImportContent('');
        } catch (error) {
            console.error('Import failed:', error);
            toast.error(`Import failed: ${error}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const applyPreset = (presetName: string) => {
        if (!config) return;
        let newConfig = { ...config };

        // Presets: Official, PvP, MMO, Boss Hunter, Infinity
        if (presetName === 'Official') {
            newConfig.General.NumberFormat = 'standard';
            newConfig.General.GlobalTextSizeMultiplier = 1.0;
            newConfig.General.GlobalLifetimeMultiplier = 1.0;
            // Setup default categories
            Object.keys(newConfig.Categories).forEach(cat => {
                newConfig.Categories[cat].Size = 1.0;
                newConfig.Categories[cat].Animation = 'float';
                newConfig.Categories[cat].Glow = false;
            });
            toast.success('Official Preset applied!');
        } else if (presetName === 'PvP') {
            newConfig.General.NumberFormat = 'compact';
            newConfig.General.GlobalTextSizeMultiplier = 0.8;
            newConfig.General.GlobalLifetimeMultiplier = 0.7;
            Object.keys(newConfig.Categories).forEach(cat => {
                newConfig.Categories[cat].Size = 0.8;
                newConfig.Categories[cat].Animation = 'float';
                newConfig.Categories[cat].Glow = false;
                newConfig.Categories[cat].Outline = true;
            });
            toast.success('PvP Minimal Preset applied!');
        } else if (presetName === 'MMO') {
            newConfig.General.NumberFormat = 'comma';
            newConfig.General.GlobalTextSizeMultiplier = 1.3;
            newConfig.General.GlobalLifetimeMultiplier = 1.4;
            Object.keys(newConfig.Categories).forEach(cat => {
                newConfig.Categories[cat].Size = 1.3;
                newConfig.Categories[cat].Animation = 'bounce';
                newConfig.Categories[cat].Glow = true;
                newConfig.Categories[cat].Font = 'impact';
                newConfig.Categories[cat].Weight = 'heavy';
            });
            toast.success('MMO RPG Preset applied!');
        } else if (presetName === 'Boss Hunter') {
            newConfig.General.NumberFormat = 'comma';
            newConfig.General.GlobalTextSizeMultiplier = 1.5;
            newConfig.General.GlobalLifetimeMultiplier = 2.0;
            newConfig.Categories.Bosses.Size = 2.2;
            newConfig.Categories.Bosses.Animation = 'pop';
            newConfig.Categories.Bosses.Glow = true;
            toast.success('Boss Hunter Preset applied!');
        } else if (presetName === 'Infinity') {
            newConfig.General.NumberFormat = 'comma';
            newConfig.General.GlobalTextSizeMultiplier = 1.2;
            newConfig.General.GlobalLifetimeMultiplier = 1.3;
            Object.keys(newConfig.Categories).forEach(cat => {
                newConfig.Categories[cat].Size = 1.2;
                newConfig.Categories[cat].Animation = 'pop';
                newConfig.Categories[cat].Glow = true;
                newConfig.Categories[cat].Outline = true;
            });
            newConfig.CriticalHits.SizeMultiplier = 1.8;
            newConfig.CriticalHits.ParticleEffect = 'explosion';
            newConfig.CriticalHits.ScreenShake = true;
            toast.success('Infinity Premium Preset applied!');
        }

        setConfig(newConfig);
    };

    // Live Preview trigger
    const triggerHit = () => {
        if (!config) return;

        // Get preview category values
        const catConfig = config.Categories[previewCategory] || {
            Color: '#FFFFFF',
            Size: 1.0,
            Font: 'default',
            Weight: 'bold',
            Glow: false,
            Outline: true,
            Animation: 'float'
        };

        // Format value based on NumberFormat setting
        let displayText = previewValue;
        const valNum = parseInt(previewValue) || 125000;
        const fmt = config.General.NumberFormat;
        if (fmt === 'comma') {
            displayText = valNum.toLocaleString();
        } else if (fmt === 'compact') {
            if (valNum >= 1000000000) displayText = (valNum / 1000000000).toFixed(1) + 'B';
            else if (valNum >= 1000000) displayText = (valNum / 1000000).toFixed(1) + 'M';
            else if (valNum >= 1000) displayText = (valNum / 1000).toFixed(1) + 'K';
        } else if (fmt === 'scientific') {
            displayText = valNum.toExponential(2);
        }

        // Check if critical threshold is exceeded
        const isCrit = previewCategory !== 'Healing' && previewCategory !== 'Xp' && previewCategory !== 'Harvest' && valNum >= config.CriticalHits.Threshold;
        
        let displayColor = catConfig.Color;
        let displaySize = catConfig.Size * config.General.GlobalTextSizeMultiplier;
        let displayAnim = catConfig.Animation;
        let displayWeight = catConfig.Weight;

        if (isCrit) {
            displayText = `CRITICAL HIT\n${displayText}`;
            displayColor = config.CriticalHits.Color;
            displaySize = displaySize * config.CriticalHits.SizeMultiplier;
            displayAnim = 'pop';
            displayWeight = 'heavy';
        }

        // Stagger positions slightly
        const randomX = 40 + Math.random() * 20; // Percent
        const randomY = 40 + Math.random() * 20; // Percent

        const newHit: FloatingText = {
            id: Date.now(),
            text: displayText,
            x: randomX,
            y: randomY,
            color: displayColor,
            size: displaySize,
            font: catConfig.Font,
            weight: displayWeight,
            glow: catConfig.Glow || isCrit,
            outline: catConfig.Outline,
            animation: displayAnim
        };

        setFloatingTexts(prev => [...prev.slice(-15), newHit]);

        // Auto remove hit based on duration
        const lifetime = (catConfig.Lifetime || 1.5) * config.General.GlobalLifetimeMultiplier * 1000;
        setTimeout(() => {
            setFloatingTexts(prev => prev.filter(t => t.id !== newHit.id));
        }, lifetime);
    };

    const updateConfigField = (section: keyof DamageConfig, field: string, value: any) => {
        if (!config) return;
        setConfig(prev => {
            if (!prev) return null;
            const updatedSection = { ...prev[section] } as any;
            updatedSection[field] = value;
            return {
                ...prev,
                [section]: updatedSection
            };
        });
    };

    const updateCategoryField = (category: string, field: keyof CategoryConfig, value: any) => {
        if (!config) return;
        setConfig(prev => {
            if (!prev) return null;
            const updatedCategories = { ...prev.Categories };
            updatedCategories[category] = {
                ...updatedCategories[category],
                [field]: value
            };
            return {
                ...prev,
                Categories: updatedCategories
            };
        });
    };

    // Tabs
    const tabs = [
        { id: 'dashboard', name: 'Dashboard', icon: Gauge },
        { id: 'colors', name: 'Colors', icon: Palette },
        { id: 'text', name: 'Text & Fonts', icon: Type },
        { id: 'animations', name: 'Animations', icon: Activity },
        { id: 'critical', name: 'Critical Hits', icon: AlertOctagon },
        { id: 'boss', name: 'Boss Damage', icon: Flame },
        { id: 'healing', name: 'Healing & XP', icon: Heart },
        { id: 'harvest', name: 'Harvest & Loot', icon: Sparkles },
        { id: 'presets', name: 'Presets', icon: Layers },
        { id: 'performance', name: 'Performance', icon: Settings },
        { id: 'analytics', name: 'Analytics', icon: BarChart3 },
        { id: 'settings', name: 'Settings', icon: Settings }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 font-display flex items-center gap-3">
                        <Flame className="w-9 h-9 text-cyan-400 animate-pulse" />
                        Infinity Floating Damage System
                    </h1>
                    <p className="text-slate-400 mt-2 text-base">Premium customization, visual effects, and analytics framework for floating damage</p>
                </div>

                <div className="flex items-center gap-4">
                    <ServerSelect 
                        value={selectedServerId} 
                        onChange={setSelectedServerId} 
                        accentColor="cyan" 
                    />
                    
                    {isInstalled && (
                        <button
                            onClick={handleSaveConfig}
                            disabled={isSaving || !config}
                            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 font-bold"
                        >
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            <span>Save Configuration</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Load State */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center py-40 gap-4">
                    <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
                    <p className="text-slate-400 font-medium">Loading settings...</p>
                </div>
            )}

            {/* Validation Guard Screen if Plugin Not Detected */}
            {!isLoading && selectedServerId && !isInstalled && (
                <div className="max-w-2xl mx-auto glass-panel border border-red-500/20 bg-gradient-to-b from-red-950/10 to-slate-950/40 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
                    <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <AlertOctagon className="w-10 h-10 text-red-500" />
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white uppercase tracking-wider">Infinity Floating Damage System</h2>
                        <h3 className="text-red-400 font-bold text-lg uppercase tracking-wide">ASM 2.0 Installation Not Detected</h3>
                    </div>

                    <div className="w-full bg-black/40 border border-white/5 rounded-xl p-6 font-mono text-sm text-slate-400 space-y-1.5 text-left leading-relaxed">
                        <p className="text-red-300 font-semibold">Error Message:</p>
                        <p>This module is exclusively available through ARK Server Manager 2.0.</p>
                        <p>Please install and manage this module using ASM 2.0.</p>
                    </div>

                    <p className="text-slate-400 text-sm max-w-lg mx-auto">
                        Verify this server installation has the ASA Server API enabled. Click below to install the module files and register the server license.
                    </p>

                    <div className="pt-4 flex items-center justify-center gap-4">
                        <button
                            onClick={handleInstallPlugin}
                            disabled={isInstalling}
                            className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl transition-all shadow-lg shadow-cyan-500/20 font-bold disabled:opacity-50"
                        >
                            {isInstalling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            <span>Install & Register Module</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Plugin Installed Content */}
            {!isLoading && isInstalled && config && (
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                    {/* Left Navigation Tabs */}
                    <div className="xl:col-span-1 space-y-2">
                        <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-1 bg-slate-900/30">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-3">Menu Options</p>
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-all",
                                        activeTab === tab.id
                                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    <span>{tab.name}</span>
                                </button>
                            ))}
                        </div>

                        {/* Licensing Info widget */}
                        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-gradient-to-br from-cyan-950/20 to-slate-950/20 text-xs space-y-2.5">
                            <div className="flex items-center gap-2 text-cyan-400 font-bold">
                                <Shield className="w-4 h-4" />
                                <span>Exclusive ASM License</span>
                            </div>
                            <div className="space-y-1 text-slate-400">
                                <p><span className="text-slate-500">Developer:</span> Infinity</p>
                                <p><span className="text-slate-500">Owner:</span> Sanjay</p>
                                <p className="truncate"><span className="text-slate-500">Token:</span> {config.Branding.ValidationToken.slice(0, 20)}...</p>
                            </div>
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                                <span>Status:</span>
                                <span className="text-green-500 font-bold flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    Validated
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Configuration Panels */}
                    <div className="xl:col-span-3 space-y-8">
                        {/* Live Preview Engine (Stays floating/visible on top of editing) */}
                        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 bg-[#060B13]/85 relative overflow-hidden shadow-2xl h-80 flex flex-col justify-between">
                            {/* Watermark Branding */}
                            <div className="absolute inset-0 pointer-events-none select-none flex flex-col items-center justify-center opacity-[0.03]">
                                <div className="text-5xl font-black tracking-widest text-white uppercase font-display">Infinity</div>
                                <p className="text-xs text-white">Floating Damage Engine</p>
                            </div>

                            {/* Top Controls */}
                            <div className="flex items-center justify-between border-b border-white/5 pb-3 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Eye className="w-4 h-4 text-cyan-400" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Live Preview Engine</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CustomSelect
                                        value={previewCategory}
                                        onChange={setPreviewCategory}
                                        options={Object.keys(config.Categories).map(cat => ({ value: cat, label: cat }))}
                                    />
                                    <input
                                        type="number"
                                        value={previewValue}
                                        onChange={e => setPreviewValue(e.target.value)}
                                        className="w-20 bg-slate-950 border border-slate-700/60 rounded px-2 py-1 text-xs text-center text-white focus:outline-none focus:border-cyan-500"
                                    />
                                    <button
                                        onClick={triggerHit}
                                        className="px-3.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold transition-colors"
                                    >
                                        Test Hit
                                    </button>
                                </div>
                            </div>

                            {/* Floating Text Canvas */}
                            <div className="flex-1 relative overflow-hidden w-full bg-slate-950/20 rounded-xl my-2">
                                {floatingTexts.map(text => {
                                    const fontClass = text.font === 'impact' ? 'font-sans uppercase tracking-tight' : 'font-sans';
                                    const weightClass = text.weight === 'heavy' ? 'font-black' : text.weight === 'bold' ? 'font-bold' : 'font-medium';
                                    const glowStyle = text.glow ? `drop-shadow(0 0 8px ${text.color})` : 'none';
                                    const outlineStyle = text.outline ? `1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000` : 'none';

                                    // Animations: Float, Bounce, Pop, Arc, Explosion, Impact, Official, Infinity Premium
                                    let animationClass = 'animate-fade-out';
                                    if (text.animation === 'float') animationClass = 'animate-float';
                                    else if (text.animation === 'bounce') animationClass = 'animate-bounce-damage';
                                    else if (text.animation === 'pop') animationClass = 'animate-pop-damage';
                                    else if (text.animation === 'arc') animationClass = 'animate-arc-damage';

                                    return (
                                        <div
                                            key={text.id}
                                            className={cn("absolute text-center select-none pointer-events-none transform -translate-x-1/2 -translate-y-1/2 whitespace-pre-line", animationClass)}
                                            style={{
                                                left: `${text.x}%`,
                                                top: `${text.y}%`,
                                                color: text.color,
                                                fontSize: `${text.size * 18}px`,
                                                filter: glowStyle,
                                                textShadow: outlineStyle,
                                                fontFamily: fontClass,
                                                fontWeight: weightClass as any
                                            }}
                                        >
                                            {text.text}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Info text */}
                            <div className="text-[10px] text-slate-500 text-center select-none relative z-10 pt-2 border-t border-white/5">
                                Changes are simulated locally. In-game effects will replicate the animation behaviors precisely.
                            </div>
                        </div>

                        {/* Main Tab Editing Sections */}
                        {activeTab === 'dashboard' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Enable Panel */}
                                    <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Gauge className="w-5 h-5 text-cyan-400" />
                                            System Status
                                        </h3>
                                        <p className="text-sm text-slate-400">Enable or disable the custom damage configuration globally on this server.</p>
                                        <div className="flex items-center justify-between p-4 bg-slate-950/40 rounded-xl border border-white/5">
                                            <span className="text-sm font-semibold text-white">Enable Custom Damage Numbers</span>
                                            <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                                <div className="relative">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={config.General.EnablePlugin}
                                                        onChange={(e) => updateConfigField('General', 'EnablePlugin', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="p-4 bg-slate-950/20 rounded-xl border border-white/5 space-y-2 text-xs text-slate-400">
                                            <p className="flex justify-between"><span>Active Preset:</span> <span className="text-cyan-400 font-bold">Infinity Premium</span></p>
                                            <p className="flex justify-between"><span>API Hook State:</span> <span className="text-emerald-400 font-semibold">Registered (Ok)</span></p>
                                            <p className="flex justify-between"><span>Diagnostics Status:</span> <span className="text-emerald-400 font-semibold">0 Errors detected</span></p>
                                        </div>
                                    </div>

                                    {/* Quick Preset Card */}
                                    <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Layers className="w-5 h-5 text-cyan-400" />
                                            Active Preset Quick Apply
                                        </h3>
                                        <p className="text-sm text-slate-400">Quickly apply curated settings matching your gameplay style.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Official', 'PvP', 'MMO', 'Infinity'].map(preset => (
                                                <button
                                                    key={preset}
                                                    onClick={() => applyPreset(preset)}
                                                    className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-all text-center"
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="pt-2 text-center">
                                            <span className="text-[10px] text-slate-500">Go to the Presets tab to manage custom user-defined presets.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'colors' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Palette className="w-5 h-5 text-cyan-400" />
                                            Category Colors & Customization
                                        </h3>
                                        <p className="text-sm text-slate-400">Configure custom colors, glow filters, fonts, animations, sounds, and particles per damage category.</p>
                                    </div>
                                    <div className="w-full md:w-64">
                                        <input
                                            type="text"
                                            placeholder="Filter categories..."
                                            value={categorySearchQuery}
                                            onChange={(e) => setCategorySearchQuery(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[580px] overflow-y-auto pr-2 scrollbar-thin">
                                    {Object.keys(config.Categories)
                                        .filter(catKey => catKey.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                                        .map(catKey => {
                                            const cat = config.Categories[catKey];
                                            return (
                                                <div key={catKey} className="p-5 bg-slate-950/40 rounded-xl border border-white/5 space-y-4">
                                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                        <span className="text-sm font-bold text-cyan-400">{catKey.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: cat.Color }} />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        {/* Color Picker */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Color Picker</label>
                                                            <div className="flex items-center gap-2">
                                                                <CustomColorPicker
                                                                    value={cat.Color}
                                                                    onChange={(val) => updateCategoryField(catKey, 'Color', val)}
                                                                    className="w-8 h-8 rounded-lg"
                                                                />
                                                                 <input
                                                                    type="text"
                                                                    value={cat.Color}
                                                                    onChange={(e) => updateCategoryField(catKey, 'Color', e.target.value)}
                                                                    onKeyDown={(e) => e.stopPropagation()}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Font Size */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Size Scale ({cat.Size.toFixed(1)}x)</label>
                                                            <input
                                                                type="range"
                                                                min="0.5"
                                                                max="3.0"
                                                                step="0.1"
                                                                value={cat.Size}
                                                                onChange={(e) => updateCategoryField(catKey, 'Size', parseFloat(e.target.value))}
                                                                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2.5"
                                                            />
                                                        </div>

                                                        {/* Font Family */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Font Family</label>
                                                            <CustomSelect
                                                                value={cat.Font}
                                                                onChange={(v) => updateCategoryField(catKey, 'Font', v)}
                                                                options={[
                                                                    { value: 'default', label: 'Sans-Serif' },
                                                                    { value: 'impact', label: 'Impact' },
                                                                    { value: 'serif', label: 'Serif' },
                                                                    { value: 'monospace', label: 'Monospace' }
                                                                ]}
                                                                className="w-full"
                                                            />
                                                        </div>

                                                        {/* Font Weight */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Font Weight</label>
                                                            <CustomSelect
                                                                value={cat.Weight}
                                                                onChange={(v) => updateCategoryField(catKey, 'Weight', v)}
                                                                options={[
                                                                    { value: 'normal', label: 'Normal' },
                                                                    { value: 'medium', label: 'Medium' },
                                                                    { value: 'bold', label: 'Bold' },
                                                                    { value: 'heavy', label: 'Heavy' }
                                                                ]}
                                                                className="w-full"
                                                            />
                                                        </div>

                                                        {/* Lifetime */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Lifetime ({cat.Lifetime.toFixed(1)}s)</label>
                                                            <input
                                                                type="range"
                                                                min="0.5"
                                                                max="5.0"
                                                                step="0.1"
                                                                value={cat.Lifetime}
                                                                onChange={(e) => updateCategoryField(catKey, 'Lifetime', parseFloat(e.target.value))}
                                                                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2.5"
                                                            />
                                                        </div>

                                                        {/* Animation curve */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Animation Type</label>
                                                            <CustomSelect
                                                                value={cat.Animation}
                                                                onChange={(v) => updateCategoryField(catKey, 'Animation', v)}
                                                                options={[
                                                                    { value: 'float', label: 'Floating Up' },
                                                                    { value: 'bounce', label: 'Bounce Physics' },
                                                                    { value: 'pop', label: 'Pop Out' },
                                                                    { value: 'arc', label: 'Arc Curve' }
                                                                ]}
                                                                className="w-full"
                                                            />
                                                        </div>

                                                        {/* Sound effect */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Sound Effect</label>
                                                            <input
                                                                type="text"
                                                                value={cat.Sound || ''}
                                                                onChange={(e) => updateCategoryField(catKey, 'Sound', e.target.value)}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                placeholder="e.g. hit_impact"
                                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                                                            />
                                                        </div>

                                                        {/* Particle effect */}
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Particle Effect</label>
                                                            <input
                                                                type="text"
                                                                value={cat.Particle || ''}
                                                                onChange={(e) => updateCategoryField(catKey, 'Particle', e.target.value)}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                placeholder="e.g. blood_spurt"
                                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-4 pt-2 border-t border-white/5">
                                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={cat.Glow}
                                                                onChange={(e) => updateCategoryField(catKey, 'Glow', e.target.checked)}
                                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                                                            />
                                                            <span className="text-xs text-slate-400">Glow Filter</span>
                                                        </label>

                                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={cat.Outline}
                                                                onChange={(e) => updateCategoryField(catKey, 'Outline', e.target.checked)}
                                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                                                            />
                                                            <span className="text-xs text-slate-400">Black Outline</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'text' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Type className="w-5 h-5 text-cyan-400" />
                                        Text Appearance & Global Rates
                                    </h3>
                                    <p className="text-sm text-slate-400">Modify global multipliers, number formatting rules, and visual preview options.</p>
                                </div>

                                <div className="space-y-6">
                                    {/* Global Sliders */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-300 font-semibold">Global Size Multiplier</span>
                                                <span className="text-cyan-400 font-bold">{config.General.GlobalTextSizeMultiplier.toFixed(1)}x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="3.0"
                                                step="0.1"
                                                value={config.General.GlobalTextSizeMultiplier}
                                                onChange={(e) => updateConfigField('General', 'GlobalTextSizeMultiplier', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-300 font-semibold">Global Lifetime Multiplier</span>
                                                <span className="text-cyan-400 font-bold">{config.General.GlobalLifetimeMultiplier.toFixed(1)}x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="3.0"
                                                step="0.1"
                                                value={config.General.GlobalLifetimeMultiplier}
                                                onChange={(e) => updateConfigField('General', 'GlobalLifetimeMultiplier', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Number Format selector */}
                                    <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 space-y-3">
                                        <span className="text-sm font-semibold text-white block">Number Formatting Options</span>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { id: 'standard', name: 'Standard', desc: '125000' },
                                                { id: 'comma', name: 'Comma Format', desc: '125,000' },
                                                { id: 'compact', name: 'Compact', desc: '125K' },
                                                { id: 'scientific', name: 'Scientific', desc: '1.25e+5' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => updateConfigField('General', 'NumberFormat', opt.id)}
                                                    className={cn(
                                                        "p-3 rounded-lg border text-center transition-all",
                                                        config.General.NumberFormat === opt.id
                                                            ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400 font-bold"
                                                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                                    )}
                                                >
                                                    <p className="text-xs">{opt.name}</p>
                                                    <p className="text-[10px] text-slate-500 mt-1 font-mono">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'animations' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-cyan-400" />
                                        Custom Animations Engine
                                    </h3>
                                    <p className="text-sm text-slate-400">Define motion behaviors, bounce coefficients, and transition times globally.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300 font-semibold">Global Animation Speed</span>
                                            <span className="text-cyan-400 font-bold">{config.Animations.GlobalSpeed.toFixed(1)}x</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="2.5"
                                            step="0.1"
                                            value={config.Animations.GlobalSpeed}
                                            onChange={(e) => updateConfigField('Animations', 'GlobalSpeed', parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300 font-semibold">Bounce Strength</span>
                                            <span className="text-cyan-400 font-bold">{config.Animations.BounceStrength.toFixed(1)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value={config.Animations.BounceStrength}
                                            onChange={(e) => updateConfigField('Animations', 'BounceStrength', parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300 font-semibold">Fade Duration</span>
                                            <span className="text-cyan-400 font-bold">{config.Animations.FadeDuration.toFixed(2)}s</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="1.5"
                                            step="0.05"
                                            value={config.Animations.FadeDuration}
                                            onChange={(e) => updateConfigField('Animations', 'FadeDuration', parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300 font-semibold">Scale Duration</span>
                                            <span className="text-cyan-400 font-bold">{config.Animations.ScaleDuration.toFixed(2)}s</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="1.0"
                                            step="0.05"
                                            value={config.Animations.ScaleDuration}
                                            onChange={(e) => updateConfigField('Animations', 'ScaleDuration', parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'critical' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <AlertOctagon className="w-5 h-5 text-cyan-400" />
                                        Critical Hit Customization
                                    </h3>
                                    <p className="text-sm text-slate-400">Trigger advanced text scaling and particle triggers when damage exceeds set bounds.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-sm font-semibold text-slate-300 block mb-2">Critical Hit Threshold</label>
                                            <input
                                                type="number"
                                                value={config.CriticalHits.Threshold}
                                                onChange={(e) => updateConfigField('CriticalHits', 'Threshold', parseInt(e.target.value) || 0)}
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 font-mono"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-sm font-semibold text-slate-300 block mb-2">Critical Size Multiplier</label>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="3.0"
                                                step="0.1"
                                                value={config.CriticalHits.SizeMultiplier}
                                                onChange={(e) => updateConfigField('CriticalHits', 'SizeMultiplier', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-4"
                                            />
                                            <span className="text-xs text-slate-500 mt-1 block">Current multiplier: {config.CriticalHits.SizeMultiplier.toFixed(1)}x</span>
                                        </div>

                                        <div>
                                            <label className="text-sm font-semibold text-slate-300 block mb-1">Critical Hit Color</label>
                                            <div className="flex items-center gap-2">
                                                <CustomColorPicker
                                                    value={config.CriticalHits.Color}
                                                    onChange={(val) => updateConfigField('CriticalHits', 'Color', val)}
                                                    className="w-9 h-9 rounded-lg"
                                                />
                                                <input
                                                    type="text"
                                                    value={config.CriticalHits.Color}
                                                    onChange={(e) => updateConfigField('CriticalHits', 'Color', e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-sm font-semibold text-slate-300 block mb-1">Critical Sound Effect</label>
                                            <input
                                                type="text"
                                                value={config.CriticalHits.SoundEffect}
                                                onChange={(e) => updateConfigField('CriticalHits', 'SoundEffect', e.target.value)}
                                                placeholder="e.g. crit_heavy"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-sm font-semibold text-slate-300 block mb-1">Critical Particle Effect</label>
                                            <input
                                                type="text"
                                                value={config.CriticalHits.ParticleEffect}
                                                onChange={(e) => updateConfigField('CriticalHits', 'ParticleEffect', e.target.value)}
                                                placeholder="e.g. explosion_red"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 bg-slate-950/40 rounded-lg border border-white/5">
                                            <input
                                                type="checkbox"
                                                checked={config.CriticalHits.ScreenFlash}
                                                onChange={(e) => updateConfigField('CriticalHits', 'ScreenFlash', e.target.checked)}
                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                                            />
                                            <div>
                                                <p className="text-sm font-bold text-white">Screen Flash</p>
                                                <p className="text-[10px] text-slate-500">Flash screen color tint on landing a crit</p>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 bg-slate-950/40 rounded-lg border border-white/5">
                                            <input
                                                type="checkbox"
                                                checked={config.CriticalHits.ScreenShake}
                                                onChange={(e) => updateConfigField('CriticalHits', 'ScreenShake', e.target.checked)}
                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                                            />
                                            <div>
                                                <p className="text-sm font-bold text-white">Screen Shake</p>
                                                <p className="text-[10px] text-slate-500">Shake player camera view on heavy impact</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'boss' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Flame className="w-5 h-5 text-cyan-400" />
                                        Boss Damage Customization
                                    </h3>
                                    <p className="text-sm text-slate-400">Configure visual modifiers specifically for epic encounters with wild Bosses.</p>
                                </div>

                                <div className="p-5 bg-slate-950/40 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <span className="text-sm font-bold text-cyan-400">Bosses Category Settings</span>
                                        <span className="text-xs text-slate-500 font-mono">Categories.Bosses</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Color Picker */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Boss Damage Color</label>
                                            <div className="flex items-center gap-2">
                                                <CustomColorPicker
                                                    value={config.Categories.Bosses.Color}
                                                    onChange={(val) => updateCategoryField('Bosses', 'Color', val)}
                                                    className="w-9 h-9 rounded-lg"
                                                />
                                                <input
                                                    type="text"
                                                    value={config.Categories.Bosses.Color}
                                                    onChange={(e) => updateCategoryField('Bosses', 'Color', e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white uppercase focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Size */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Font Size Scale ({config.Categories.Bosses.Size.toFixed(1)}x)</label>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="3.0"
                                                step="0.1"
                                                value={config.Categories.Bosses.Size}
                                                onChange={(e) => updateCategoryField('Bosses', 'Size', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-4"
                                            />
                                        </div>

                                        {/* Font Family */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Font Family</label>
                                            <CustomSelect
                                                value={config.Categories.Bosses.Font}
                                                onChange={(v) => updateCategoryField('Bosses', 'Font', v)}
                                                options={[
                                                    { value: 'default', label: 'Sans-Serif' },
                                                    { value: 'impact', label: 'Impact' },
                                                    { value: 'serif', label: 'Serif' },
                                                    { value: 'monospace', label: 'Monospace' }
                                                ]}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Font Weight */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Font Weight</label>
                                            <CustomSelect
                                                value={config.Categories.Bosses.Weight}
                                                onChange={(v) => updateCategoryField('Bosses', 'Weight', v)}
                                                options={[
                                                    { value: 'normal', label: 'Normal' },
                                                    { value: 'medium', label: 'Medium' },
                                                    { value: 'bold', label: 'Bold' },
                                                    { value: 'heavy', label: 'Heavy' }
                                                ]}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Animation Type */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Animation Type</label>
                                            <CustomSelect
                                                value={config.Categories.Bosses.Animation}
                                                onChange={(v) => updateCategoryField('Bosses', 'Animation', v)}
                                                options={[
                                                    { value: 'float', label: 'Floating Up' },
                                                    { value: 'bounce', label: 'Bounce Physics' },
                                                    { value: 'pop', label: 'Pop Out' },
                                                    { value: 'arc', label: 'Arc Curve' }
                                                ]}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Lifetime */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Lifetime ({config.Categories.Bosses.Lifetime.toFixed(1)}s)</label>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="5.0"
                                                step="0.1"
                                                value={config.Categories.Bosses.Lifetime}
                                                onChange={(e) => updateCategoryField('Bosses', 'Lifetime', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-4"
                                            />
                                        </div>

                                        {/* Custom Sound */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Boss Sound Effect</label>
                                            <input
                                                type="text"
                                                value={config.Categories.Bosses.Sound || ''}
                                                onChange={(e) => updateCategoryField('Bosses', 'Sound', e.target.value)}
                                                placeholder="e.g. boss_roar"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                                            />
                                        </div>

                                        {/* Custom Particle */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-300 block">Boss Particle Effect</label>
                                            <input
                                                type="text"
                                                value={config.Categories.Bosses.Particle || ''}
                                                onChange={(e) => updateCategoryField('Bosses', 'Particle', e.target.value)}
                                                placeholder="e.g. boss_sparks"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-6 pt-3 border-t border-white/5">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={config.Categories.Bosses.Glow}
                                                onChange={(e) => updateCategoryField('Bosses', 'Glow', e.target.checked)}
                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                                            />
                                            <span className="text-xs text-slate-400">Glow Filter</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={config.Categories.Bosses.Outline}
                                                onChange={(e) => updateCategoryField('Bosses', 'Outline', e.target.checked)}
                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                                            />
                                            <span className="text-xs text-slate-400">Black Outline</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'healing' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Heart className="w-5 h-5 text-cyan-400" />
                                        Healing & XP Indicators
                                    </h3>
                                    <p className="text-sm text-slate-400">Configure distinct visual settings for player restoration and leveling notifications.</p>
                                </div>

                                <div className="space-y-6">
                                    {/* Healing Category Editor */}
                                    <div className="p-5 bg-slate-950/40 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-sm font-bold text-green-400 block border-b border-white/5 pb-1">Restoration (Healing) Settings</span>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Color Picker</label>
                                                <div className="flex items-center gap-2">
                                                    <CustomColorPicker
                                                        value={config.Categories.Healing.Color}
                                                        onChange={(val) => updateCategoryField('Healing', 'Color', val)}
                                                        className="w-8 h-8 rounded-lg"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={config.Categories.Healing.Color}
                                                        onChange={(e) => updateCategoryField('Healing', 'Color', e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Font Size Scale ({config.Categories.Healing.Size.toFixed(1)}x)</label>
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="2.5"
                                                    step="0.1"
                                                    value={config.Categories.Healing.Size}
                                                    onChange={(e) => updateCategoryField('Healing', 'Size', parseFloat(e.target.value))}
                                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2.5"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Animation Type</label>
                                                <CustomSelect
                                                    value={config.Categories.Healing.Animation}
                                                    onChange={(v) => updateCategoryField('Healing', 'Animation', v)}
                                                    options={[
                                                        { value: 'float', label: 'Floating Up' },
                                                        { value: 'bounce', label: 'Bounce Physics' },
                                                        { value: 'pop', label: 'Pop Out' },
                                                        { value: 'arc', label: 'Arc Curve' }
                                                    ]}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* XP Category Editor */}
                                    <div className="p-5 bg-slate-950/40 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-sm font-bold text-blue-400 block border-b border-white/5 pb-1">XP Leveling Notification Settings</span>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Color Picker</label>
                                                <div className="flex items-center gap-2">
                                                    <CustomColorPicker
                                                        value={config.Categories.Xp.Color}
                                                        onChange={(val) => updateCategoryField('Xp', 'Color', val)}
                                                        className="w-8 h-8 rounded-lg"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={config.Categories.Xp.Color}
                                                        onChange={(e) => updateCategoryField('Xp', 'Color', e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Font Size Scale ({config.Categories.Xp.Size.toFixed(1)}x)</label>
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="2.5"
                                                    step="0.1"
                                                    value={config.Categories.Xp.Size}
                                                    onChange={(e) => updateCategoryField('Xp', 'Size', parseFloat(e.target.value))}
                                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2.5"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-550 block">Animation Type</label>
                                                <CustomSelect
                                                    value={config.Categories.Xp.Animation}
                                                    onChange={(v) => updateCategoryField('Xp', 'Animation', v)}
                                                    options={[
                                                        { value: 'float', label: 'Floating Up' },
                                                        { value: 'bounce', label: 'Bounce Physics' },
                                                        { value: 'pop', label: 'Pop Out' },
                                                        { value: 'arc', label: 'Arc Curve' }
                                                    ]}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'harvest' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-cyan-400" />
                                        Harvesting & Loot Drops
                                    </h3>
                                    <p className="text-sm text-slate-400">Configure visual settings when collecting resources or looting items, including individual resource and rarity tiers.</p>
                                </div>

                                <div className="space-y-6">
                                    {/* Main Categories */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 space-y-3">
                                            <span className="text-xs font-bold text-white block">Harvest Indicators</span>
                                            <div className="flex gap-3 items-center">
                                                <CustomColorPicker
                                                    value={config.Categories.Harvest.Color}
                                                    onChange={(val) => updateCategoryField('Harvest', 'Color', val)}
                                                    className="w-8 h-8 rounded-lg"
                                                />
                                                <input
                                                    type="text"
                                                    value={config.Categories.Harvest.Color}
                                                    onChange={(e) => updateCategoryField('Harvest', 'Color', e.target.value)}
                                                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 space-y-3">
                                            <span className="text-xs font-bold text-white block">Loot Pickup Alerts</span>
                                            <div className="flex gap-3 items-center">
                                                <CustomColorPicker
                                                    value={config.Categories.Loot.Color}
                                                    onChange={(val) => updateCategoryField('Loot', 'Color', val)}
                                                    className="w-8 h-8 rounded-lg"
                                                />
                                                <input
                                                    type="text"
                                                    value={config.Categories.Loot.Color}
                                                    onChange={(e) => updateCategoryField('Loot', 'Color', e.target.value)}
                                                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Resource Colors Sub-section */}
                                    <div className="p-5 bg-slate-950/20 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-sm font-bold text-cyan-400 block border-b border-white/5 pb-1">Resource Type Custom Colors</span>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {Object.entries(config.ResourceColors || {
                                                Wood: '#8B5A2B', Stone: '#808080', Fiber: '#228B22', Metal: '#B0C4DE',
                                                Element: '#00FFFF', Flint: '#4F4F4F', Thatch: '#D2B48C'
                                            }).map(([resource, color]) => (
                                                <div key={resource} className="p-2 bg-slate-950/40 rounded-lg border border-white/5 flex flex-col gap-1.5">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">{resource}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <CustomColorPicker
                                                            value={color}
                                                            onChange={(val) => {
                                                                const resColors = { ...(config.ResourceColors || {}), [resource]: val };
                                                                setConfig(prev => prev ? { ...prev, ResourceColors: resColors } : null);
                                                            }}
                                                            className="w-6 h-6 rounded"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={color}
                                                            onChange={(e) => {
                                                                const resColors = { ...(config.ResourceColors || {}), [resource]: e.target.value };
                                                                setConfig(prev => prev ? { ...prev, ResourceColors: resColors } : null);
                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-white uppercase focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Loot Rarity Colors Sub-section */}
                                    <div className="p-5 bg-slate-950/20 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-sm font-bold text-cyan-400 block border-b border-white/5 pb-1">Loot Rarity Tier Colors</span>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {Object.entries(config.RarityColors || {
                                                Primitive: '#FFFFFF', Ramshackle: '#22C55E', Apprentice: '#3B82F6',
                                                Journeyman: '#818CF8', Mastercraft: '#EAB308', Ascendant: '#EF4444'
                                            }).map(([rarity, color]) => (
                                                <div key={rarity} className="p-2.5 bg-slate-950/40 rounded-lg border border-white/5 flex flex-col gap-1.5">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">{rarity}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <CustomColorPicker
                                                            value={color}
                                                            onChange={(val) => {
                                                                const rarColors = { ...(config.RarityColors || {}), [rarity]: val };
                                                                setConfig(prev => prev ? { ...prev, RarityColors: rarColors } : null);
                                                            }}
                                                            className="w-6 h-6 rounded"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={color}
                                                            onChange={(e) => {
                                                                const rarColors = { ...(config.RarityColors || {}), [rarity]: e.target.value };
                                                                setConfig(prev => prev ? { ...prev, RarityColors: rarColors } : null);
                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white uppercase focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'presets' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-8">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-cyan-400" />
                                        Curated Presets Library
                                    </h3>
                                    <p className="text-sm text-slate-400">Select an existing preset or save your current customizations to a user-defined preset slot.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { id: 'Official', name: 'Official ARK style', desc: 'Standard ARK defaults. Minimal animations, basic white colors, clean fonts.' },
                                        { id: 'PvP', name: 'PvP Minimalist', desc: 'Fast fade times, compact numbers (K/M), small sizing to maximize screen visibility.' },
                                        { id: 'MMO', name: 'RPG MMO style', desc: 'Large font weights, bounce animations, visible glow effects representing typical RPG games.' },
                                        { id: 'Infinity', name: 'Infinity Premium', desc: 'Vivid colors, bounce + pop animation mixes, custom glow layers, and particle shaking.' }
                                    ].map(preset => (
                                        <div key={preset.id} className="p-4 bg-slate-950/40 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
                                            <div>
                                                <h4 className="font-bold text-white text-sm">{preset.name}</h4>
                                                <p className="text-xs text-slate-400 mt-1">{preset.desc}</p>
                                            </div>
                                            <button
                                                onClick={() => applyPreset(preset.id)}
                                                className="w-full mt-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all text-center"
                                            >
                                                Apply Preset
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Custom Presets */}
                                <div className="pt-6 border-t border-white/5 space-y-4">
                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Custom User Profiles</h4>
                                    <div className="flex gap-3 bg-slate-950/40 p-4 rounded-xl border border-white/5">
                                        <input
                                            type="text"
                                            placeholder="New preset name..."
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <button
                                            onClick={() => saveCustomPreset(newPresetName)}
                                            disabled={!newPresetName.trim()}
                                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all"
                                        >
                                            Save Current Config
                                        </button>
                                    </div>

                                    {customPresets.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic text-center py-4 bg-slate-950/20 rounded-xl border border-white/5 border-dashed">No custom presets saved yet.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {customPresets.map(preset => (
                                                <div key={preset.id} className="p-3.5 bg-slate-950/40 rounded-xl border border-white/5 flex items-center justify-between">
                                                    <div>
                                                        <h5 className="font-bold text-slate-200 text-xs">{preset.name}</h5>
                                                        <p className="text-[10px] text-slate-500">Custom Profile</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setConfig(JSON.parse(JSON.stringify(preset.config)));
                                                                toast.success(`Preset "${preset.name}" applied! Remember to click "Save Configuration" at the top.`);
                                                            }}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition-colors"
                                                        >
                                                            Apply
                                                        </button>
                                                        <button
                                                            onClick={() => deleteCustomPreset(preset.id)}
                                                            className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'performance' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Settings className="w-5 h-5 text-cyan-400" />
                                        Performance Sizing Controls
                                    </h3>
                                    <p className="text-sm text-slate-400">Protect client rendering performance during heavy combat scenarios.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-300 font-semibold">Maximum Visible Numbers</span>
                                                <span className="text-cyan-400 font-bold">{config.Performance.MaxVisibleNumbers}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="10"
                                                max="150"
                                                step="5"
                                                value={config.Performance.MaxVisibleNumbers}
                                                onChange={(e) => updateConfigField('Performance', 'MaxVisibleNumbers', parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-300 font-semibold">Distance Culling Range</span>
                                                <span className="text-cyan-400 font-bold">{config.Performance.DistanceCullingRange}m</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="500"
                                                max="8000"
                                                step="250"
                                                value={config.Performance.DistanceCullingRange}
                                                onChange={(e) => updateConfigField('Performance', 'DistanceCullingRange', parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={config.Performance.DynamicScalingEnabled}
                                                onChange={(e) => updateConfigField('Performance', 'DynamicScalingEnabled', e.target.checked)}
                                                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                                            />
                                            <div>
                                                <p className="text-sm font-semibold text-white">Dynamic Sizing Squeeze</p>
                                                <p className="text-[10px] text-slate-500">Reduce floating text size as more elements are spawned in order to keep visual cleanliness.</p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* CPU/GPU Impact Gauge */}
                                    <div className="p-5 bg-slate-950/20 rounded-xl border border-white/5 space-y-3">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Rendering Overhead Estimate</span>
                                        {(() => {
                                            const maxVis = config.Performance.MaxVisibleNumbers;
                                            const cullDist = config.Performance.DistanceCullingRange;
                                            const dynamicScaling = config.Performance.DynamicScalingEnabled;
                                            let overhead = Math.round((maxVis / 150) * 50 + (cullDist / 8000) * 50);
                                            if (dynamicScaling) overhead = Math.max(10, Math.round(overhead * 0.7));
                                            
                                            const isHigh = overhead > 75;
                                            const isMedium = overhead > 40 && overhead <= 75;
                                            
                                            return (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-semibold text-slate-300">Client Engine Load score:</span>
                                                        <span className={cn(
                                                            "font-bold",
                                                            isHigh ? "text-red-500" : isMedium ? "text-amber-500" : "text-emerald-500"
                                                        )}>{overhead}% ({isHigh ? 'High Impact' : isMedium ? 'Moderate' : 'Low/Safe'})</span>
                                                    </div>
                                                    
                                                    {/* Color Bar */}
                                                    <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-white/5 flex">
                                                        <div 
                                                            className={cn(
                                                                "h-full rounded-full transition-all duration-300",
                                                                isHigh ? "bg-gradient-to-r from-red-600 to-red-500" : isMedium ? "bg-gradient-to-r from-amber-600 to-amber-500" : "bg-gradient-to-r from-emerald-600 to-emerald-500"
                                                            )}
                                                            style={{ width: `${overhead}%` }}
                                                        />
                                                    </div>

                                                    {isHigh && (
                                                        <p className="text-[10.5px] text-red-400 leading-relaxed font-semibold">
                                                            ⚠️ Warning: Extreme values may decrease in-game framerate during heavy raid conditions! Consider enabling Dynamic Sizing Squeeze or reducing cull distance.
                                                        </p>
                                                    )}
                                                    {!isHigh && (
                                                        <p className="text-[10.5px] text-slate-500 leading-relaxed">
                                                            Settings are optimized for solid client rendering performance without cluttering the viewport.
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'analytics' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-6">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-cyan-400" />
                                        Floating Damage Analytics
                                    </h3>
                                    <p className="text-sm text-slate-400">Historical performance trends and combat diagnostics gathered on this server.</p>
                                </div>

                                {analytics.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No analytics data recorded yet.</p>
                                ) : (
                                    <div className="space-y-8">
                                        {/* Total events chart */}
                                        <div className="p-4 bg-slate-950/20 rounded-xl border border-white/5">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Total Damage Events (24h)</h4>
                                            <div className="h-64 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={analytics}>
                                                        <defs>
                                                            <linearGradient id="damageGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                        <XAxis dataKey="time" stroke="#475569" fontSize={11} />
                                                        <YAxis stroke="#475569" fontSize={11} />
                                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                                                        <Area type="monotone" dataKey="totalDamage" stroke="#06b6d4" fillOpacity={1} fill="url(#damageGrad)" name="Total Damage" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* Grid for two subset charts */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-4 bg-slate-950/20 rounded-xl border border-white/5">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">XP Events vs Loot Events</h4>
                                                <div className="h-48 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={analytics}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                            <XAxis dataKey="time" stroke="#475569" fontSize={10} />
                                                            <YAxis stroke="#475569" fontSize={10} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                                                            <Area type="monotone" dataKey="xpEvents" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="XP Events" />
                                                            <Area type="monotone" dataKey="lootEvents" stroke="#eab308" fill="#eab308" fillOpacity={0.1} name="Loot events" />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-slate-950/20 rounded-xl border border-white/5">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Resource harvesting Collection</h4>
                                                <div className="h-48 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={analytics}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                            <XAxis dataKey="time" stroke="#475569" fontSize={10} />
                                                            <YAxis stroke="#475569" fontSize={10} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                                                            <Bar dataKey="resourceCollection" fill="#d97706" name="Resources Collected" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="glass-panel p-6 rounded-xl border border-white/5 space-y-8">
                                {/* Local configuration backups */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <RefreshCw className="w-5 h-5 text-cyan-400" />
                                        Client-Side Config Backups
                                    </h3>
                                    <p className="text-sm text-slate-400">Save and manage localized historical configuration snapshot profiles on this server instance.</p>
                                    
                                    <div className="flex gap-3 bg-slate-950/40 p-4 rounded-xl border border-white/5">
                                        <input
                                            type="text"
                                            placeholder="Backup snapshot profile name..."
                                            value={newBackupName}
                                            onChange={(e) => setNewBackupName(e.target.value)}
                                            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <button
                                            onClick={() => createBackup(newBackupName)}
                                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all"
                                        >
                                            Take Snapshot
                                        </button>
                                    </div>

                                    {backups.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic text-center py-4 bg-slate-950/20 rounded-xl border border-white/5 border-dashed">No local backup snapshots found.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                            {backups.map(backup => (
                                                <div key={backup.id} className="p-3 bg-slate-950/40 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                                                    <div>
                                                        <h5 className="font-bold text-slate-200">{backup.name}</h5>
                                                        <p className="text-[10px] text-slate-500">Timestamp: {backup.timestamp}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => restoreBackup(backup.config)}
                                                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded font-semibold transition-colors"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => deleteBackup(backup.id)}
                                                            className="p-1 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Import Export section */}
                                <div className="space-y-4 pt-6 border-t border-white/5">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <FileJson className="w-5 h-5 text-cyan-400" />
                                        Configuration Import & Export
                                    </h3>
                                    <p className="text-sm text-slate-400">Share or backup settings using multiple standard formats.</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/40 rounded-xl border border-white/5">
                                        {/* Export */}
                                        <div className="space-y-3">
                                            <span className="text-sm font-semibold text-white block">Export Profile</span>
                                            <div className="flex gap-2">
                                                <CustomSelect
                                                    value={exportFormat}
                                                    onChange={setExportFormat}
                                                    options={[
                                                        { value: 'json', label: 'JSON' },
                                                        { value: 'yaml', label: 'YAML' },
                                                        { value: 'xml', label: 'XML' }
                                                    ]}
                                                />
                                                <button
                                                    onClick={handleExport}
                                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Download Configuration
                                                </button>
                                            </div>
                                        </div>

                                        {/* Import */}
                                        <div className="space-y-3">
                                            <span className="text-sm font-semibold text-white block">Import Profile</span>
                                            <div className="flex gap-2">
                                                <CustomSelect
                                                    value={importFormat}
                                                    onChange={setImportFormat}
                                                    options={[
                                                        { value: 'json', label: 'JSON' },
                                                        { value: 'yaml', label: 'YAML' },
                                                        { value: 'xml', label: 'XML' }
                                                    ]}
                                                />
                                                <button
                                                    onClick={handleImport}
                                                    disabled={!importContent.trim()}
                                                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                                >
                                                    Apply Import
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Import textarea */}
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-400 block font-semibold">Paste Import Code Content</label>
                                        <textarea
                                            value={importContent}
                                            onChange={e => setImportContent(e.target.value)}
                                            placeholder={`Paste exported ${importFormat.toUpperCase()} config text here...`}
                                            className="w-full h-32 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 font-mono text-xs text-white focus:outline-none focus:border-cyan-500/50"
                                        />
                                    </div>
                                </div>

                                {/* Danger Zone */}
                                <div className="pt-6 border-t border-white/5 space-y-4">
                                    <h3 className="text-lg font-bold text-red-400">Danger Zone</h3>
                                    <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-white">Uninstall Module</p>
                                            <p className="text-xs text-slate-500">Remove all module files and settings from this server path.</p>
                                        </div>
                                        <button
                                            onClick={handleUninstallPlugin}
                                            className="px-5 py-2.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 hover:border-red-500/50 text-red-400 rounded-xl transition-all text-xs font-bold cursor-pointer"
                                        >
                                            Uninstall
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
