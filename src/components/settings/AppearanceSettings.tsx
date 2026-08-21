import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Palette, Check, Sliders, Sparkles, RefreshCw, Copy, CheckCheck, 
    Upload, Sun, Moon, Zap, Layers, Eye, Flame, Compass
} from 'lucide-react';
import { useThemeStore, AVAILABLE_THEMES, AppTheme, CustomThemeConfig } from '../../stores/themeStore';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

const QUICK_INSPIRATION_PRESETS: Array<{
    name: string;
    icon: string;
    config: CustomThemeConfig;
}> = [
    {
        name: 'Cyberpunk Neon',
        icon: '⚡',
        config: {
            baseMode: 'oled',
            primaryAccent: '#00f0ff',
            secondaryAccent: '#f43f5e',
            backgroundTint: '#030508',
            surfaceStyle: 'glass',
            glowIntensity: 'vibrant',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Toxic Mint',
        icon: '🍃',
        config: {
            baseMode: 'dark',
            primaryAccent: '#10b981',
            secondaryAccent: '#84cc16',
            backgroundTint: '#05130b',
            surfaceStyle: 'glass',
            glowIntensity: 'subtle',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Crimson Blood',
        icon: '🩸',
        config: {
            baseMode: 'oled',
            primaryAccent: '#ef4444',
            secondaryAccent: '#f97316',
            backgroundTint: '#120707',
            surfaceStyle: 'glass',
            glowIntensity: 'vibrant',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Royal Amethyst',
        icon: '👑',
        config: {
            baseMode: 'dark',
            primaryAccent: '#a855f7',
            secondaryAccent: '#ec4899',
            backgroundTint: '#0d0818',
            surfaceStyle: 'glass',
            glowIntensity: 'vibrant',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Solar Flare',
        icon: '☀️',
        config: {
            baseMode: 'dark',
            primaryAccent: '#f59e0b',
            secondaryAccent: '#fbbf24',
            backgroundTint: '#130e06',
            surfaceStyle: 'glass',
            glowIntensity: 'subtle',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Deep Oceanic',
        icon: '🌊',
        config: {
            baseMode: 'dark',
            primaryAccent: '#0284c7',
            secondaryAccent: '#38bdf8',
            backgroundTint: '#061224',
            surfaceStyle: 'glass',
            glowIntensity: 'subtle',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Sakura Pink',
        icon: '🌸',
        config: {
            baseMode: 'dark',
            primaryAccent: '#f472b6',
            secondaryAccent: '#fb7185',
            backgroundTint: '#160814',
            surfaceStyle: 'glass',
            glowIntensity: 'vibrant',
            borderRadius: 'rounded',
        }
    },
    {
        name: 'Pure Stealth OLED',
        icon: '🕶️',
        config: {
            baseMode: 'oled',
            primaryAccent: '#38bdf8',
            secondaryAccent: '#64748b',
            backgroundTint: '#000000',
            surfaceStyle: 'solid',
            glowIntensity: 'none',
            borderRadius: 'medium',
        }
    },
];

const ACCENT_COLOR_SWATCHES = [
    { label: 'Cyan', hex: '#00f0ff' },
    { label: 'Sky Blue', hex: '#0ea5e9' },
    { label: 'Royal Blue', hex: '#2563eb' },
    { label: 'Indigo', hex: '#6366f1' },
    { label: 'Purple', hex: '#a855f7' },
    { label: 'Pink', hex: '#ec4899' },
    { label: 'Rose', hex: '#f43f5e' },
    { label: 'Red', hex: '#ef4444' },
    { label: 'Orange', hex: '#f97316' },
    { label: 'Amber', hex: '#f59e0b' },
    { label: 'Lime', hex: '#84cc16' },
    { label: 'Emerald', hex: '#10b981' },
];

const BACKGROUND_SWATCHES = [
    { label: 'Charcoal Slate', hex: '#0a0d14' },
    { label: 'Midnight Navy', hex: '#070d1d' },
    { label: 'OLED Pitch Black', hex: '#000000' },
    { label: 'Deep Amethyst', hex: '#0d0818' },
    { label: 'Volcanic Dark', hex: '#120707' },
    { label: 'Forest Pine', hex: '#05130b' },
    { label: 'Dark Mocha', hex: '#140e0a' },
    { label: 'Deep Ocean', hex: '#061224' },
];

export default function AppearanceSettings() {
    const { t } = useTranslation();
    const { theme: activeTheme, customConfig, setTheme, setCustomConfig, resetCustomTheme } = useThemeStore();
    const [activeTab, setActiveTab] = useState<'presets' | 'studio'>('presets');
    const [selectedCategory, setSelectedCategory] = useState<'all' | 'dark' | 'special' | 'light'>('all');
    const [copiedJson, setCopiedJson] = useState(false);

    const handleSelectTheme = (themeId: AppTheme) => {
        if (themeId === activeTheme) return;
        setTheme(themeId);
        toast.success(
            t('settings.appearance.themeApplied', 'Applied {{name}} theme', {
                name: AVAILABLE_THEMES.find(t => t.id === themeId)?.name || themeId
            }),
            { id: 'theme-switch-toast' }
        );
    };

    const handleApplyCustomTheme = () => {
        setTheme('custom');
        toast.success('Applied your Custom Theme configuration!', { id: 'theme-switch-toast' });
    };

    const handleCopyConfig = () => {
        navigator.clipboard.writeText(JSON.stringify(customConfig, null, 2));
        setCopiedJson(true);
        toast.success('Custom theme config copied to clipboard!');
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const handleImportConfig = () => {
        const input = prompt('Paste your theme configuration JSON here:');
        if (!input) return;
        try {
            const parsed = JSON.parse(input);
            setCustomConfig(parsed);
            if (activeTheme !== 'custom') {
                setTheme('custom');
            }
            toast.success('Successfully imported custom theme config!');
        } catch {
            toast.error('Invalid theme configuration JSON format.');
        }
    };

    const filteredThemes = AVAILABLE_THEMES.filter(theme => {
        if (selectedCategory === 'all') return true;
        return theme.category === selectedCategory;
    });

    const isCustomActive = activeTheme === 'custom';

    return (
        <div className="space-y-8 animate-in slide-in-from-left-4 duration-300">
            {/* Header Banner */}
            <div className="glass-panel rounded-3xl p-7 shadow-xl relative overflow-hidden bg-[var(--surface)] border border-[var(--border)]">
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-sky-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative z-10">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-gradient-to-br from-sky-500/20 to-blue-600/10 border border-sky-500/30 rounded-2xl shadow-inner text-sky-400">
                            <Palette className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                    {t('settings.appearance.title', 'Application Theme & Visual Style')}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                    10 Styles + Custom
                                </span>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                                {t('settings.appearance.description', 'Customize the visual atmosphere of ARK Server Manager. Changes apply globally in real-time across all panels, dashboards, terminals, and modals.')}
                            </p>
                        </div>
                    </div>

                    {/* Mode Navigation Tabs */}
                    <div className="flex items-center bg-[var(--bg-primary)] p-1.5 rounded-2xl border border-[var(--border)] shrink-0 self-stretch sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setActiveTab('presets')}
                            className={cn(
                                "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'presets'
                                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-md border border-[var(--border)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            )}
                        >
                            <Compass className="w-4 h-4 text-sky-400" />
                            <span>Presets ({AVAILABLE_THEMES.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('studio')}
                            className={cn(
                                "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'studio'
                                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            )}
                        >
                            <Sparkles className="w-4 h-4 text-amber-300" />
                            <span>Custom UI Studio</span>
                            {isCustomActive && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* TAB 1: PRESET THEMES */}
            {activeTab === 'presets' && (
                <div className="space-y-6">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-2 flex-wrap pb-1">
                        {[
                            { id: 'all', label: 'All Themes', count: AVAILABLE_THEMES.length },
                            { id: 'dark', label: 'Dark Charcoal', count: AVAILABLE_THEMES.filter(t => t.category === 'dark').length },
                            { id: 'special', label: 'Cyberpunk & Vibrant', count: AVAILABLE_THEMES.filter(t => t.category === 'special').length },
                            { id: 'light', label: 'Light Mode', count: AVAILABLE_THEMES.filter(t => t.category === 'light').length },
                        ].map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id as any)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                                    selectedCategory === cat.id
                                        ? "bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm"
                                        : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                {cat.label} <span className="opacity-60 text-[10px] ml-1">({cat.count})</span>
                            </button>
                        ))}
                    </div>

                    {/* Theme Selector Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredThemes.map((themeItem) => {
                            const isSelected = activeTheme === themeItem.id;
                            const { id, name, description, category, badge, colors } = themeItem;

                            return (
                                <div
                                    key={id}
                                    onClick={() => handleSelectTheme(id)}
                                    className={cn(
                                        "group relative rounded-3xl p-6 transition-all duration-300 cursor-pointer border flex flex-col justify-between overflow-hidden shadow-xl bg-[var(--surface)]",
                                        isSelected
                                            ? "border-sky-500 ring-2 ring-sky-500/40 shadow-sky-500/10"
                                            : "border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
                                    )}
                                >
                                    {/* Miniature Desktop UI Simulator Preview */}
                                    <div 
                                        className="w-full h-32 rounded-2xl mb-5 overflow-hidden border border-black/10 dark:border-white/10 relative p-2.5 flex flex-col justify-between select-none shadow-inner"
                                        style={{ backgroundColor: colors.background }}
                                    >
                                        {/* Top mini titlebar */}
                                        <div 
                                            className="flex items-center justify-between px-2 py-1 rounded-lg border border-black/5 dark:border-white/5"
                                            style={{ backgroundColor: colors.card }}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />
                                                <div className="w-12 h-1.5 rounded-full opacity-40" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                            </div>
                                            <div className="flex items-center gap-1 opacity-40">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                            </div>
                                        </div>

                                        {/* Body with mock sidebar and content */}
                                        <div className="flex-1 flex gap-2 pt-2">
                                            {/* Mini sidebar */}
                                            <div 
                                                className="w-8 rounded-lg flex flex-col gap-1.5 p-1 border border-black/5 dark:border-white/5"
                                                style={{ backgroundColor: colors.card }}
                                            >
                                                <div className="w-full h-2 rounded" style={{ backgroundColor: colors.accent }} />
                                                <div className="w-full h-1.5 rounded opacity-30" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                                <div className="w-full h-1.5 rounded opacity-30" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                            </div>

                                            {/* Mini dashboard cards */}
                                            <div className="flex-1 grid grid-cols-2 gap-1.5">
                                                <div 
                                                    className="rounded-lg p-1.5 border border-black/5 dark:border-white/5 flex flex-col justify-between"
                                                    style={{ backgroundColor: colors.card }}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.statusSuccess }} />
                                                        <div className="w-8 h-1.5 rounded opacity-40" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                                    </div>
                                                    <div className="w-10 h-2 rounded" style={{ backgroundColor: colors.accent }} />
                                                </div>
                                                <div 
                                                    className="rounded-lg p-1.5 border border-black/5 dark:border-white/5 flex flex-col justify-between"
                                                    style={{ backgroundColor: colors.card }}
                                                >
                                                    <div className="w-6 h-1.5 rounded opacity-30" style={{ backgroundColor: colors.textPrimary || '#888888' }} />
                                                    <div className="w-8 h-1.5 rounded opacity-50" style={{ backgroundColor: colors.accentSecondary || colors.accent }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Theme Details & Palette Swatches */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <h3 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-sky-400 transition-colors">
                                                    {name}
                                                </h3>
                                                {badge && (
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                                                        category === 'dark' ? "bg-slate-500/15 text-[var(--text-secondary)] border border-[var(--border)]" :
                                                        category === 'special' ? "bg-purple-500/20 text-purple-300 border border-purple-500/40" :
                                                        "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                                                    )}>
                                                        {badge}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Active Radio Pill */}
                                            <div className={cn(
                                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                                                isSelected
                                                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                                                    : "bg-[var(--surface-hover)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                                            )}>
                                                {isSelected ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5" />
                                                        <span>{t('common.active', 'Active')}</span>
                                                    </>
                                                ) : (
                                                    <span>{t('settings.appearance.select', 'Select')}</span>
                                                )}
                                            </div>
                                        </div>

                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed min-h-[36px]">
                                            {description}
                                        </p>

                                        {/* Color Swatches */}
                                        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                                            <span className="font-semibold">{t('settings.appearance.palette', 'Palette Swatches')}</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-4 h-4 rounded-full border border-black/20 dark:border-white/20 shadow-sm" style={{ backgroundColor: colors.background }} title="Background" />
                                                <span className="w-4 h-4 rounded-full border border-black/20 dark:border-white/20 shadow-sm" style={{ backgroundColor: colors.card }} title="Card/Surface" />
                                                <span className="w-4 h-4 rounded-full border border-black/20 dark:border-white/20 shadow-sm" style={{ backgroundColor: colors.accent }} title="Primary Accent" />
                                                {colors.accentSecondary && (
                                                    <span className="w-4 h-4 rounded-full border border-black/20 dark:border-white/20 shadow-sm" style={{ backgroundColor: colors.accentSecondary }} title="Secondary Accent" />
                                                )}
                                                <span className="w-4 h-4 rounded-full border border-black/20 dark:border-white/20 shadow-sm" style={{ backgroundColor: colors.statusSuccess }} title="Status Indicator" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB 2: CUSTOM THEME STUDIO */}
            {activeTab === 'studio' && (
                <div className="space-y-8">
                    {/* Studio Intro & Quick Apply Bar */}
                    <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3.5 bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/30 rounded-2xl text-purple-400">
                                <Sliders className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <span>Personalize Your Own ARK Server Manager UI</span>
                                    {isCustomActive && (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            Currently Active
                                        </span>
                                    )}
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Pick custom accents, background tones, and glass aesthetics. Changes preview instantly and apply globally.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 w-full md:w-auto">
                            {!isCustomActive && (
                                <button
                                    type="button"
                                    onClick={handleApplyCustomTheme}
                                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-950/30 transition-all cursor-pointer"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span>Activate Custom Theme</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleCopyConfig}
                                className="p-2.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border)] transition-all cursor-pointer"
                                title="Copy Theme JSON"
                            >
                                {copiedJson ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={handleImportConfig}
                                className="p-2.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border)] transition-all cursor-pointer"
                                title="Import Theme JSON"
                            >
                                <Upload className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={resetCustomTheme}
                                className="p-2.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-red-400 rounded-xl border border-[var(--border)] transition-all cursor-pointer"
                                title="Reset to Defaults"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Quick Inspiration Preset Badges */}
                    <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                Quick Palette Inspiration
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">Click any card to load values into studio</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {QUICK_INSPIRATION_PRESETS.map((preset) => (
                                <button
                                    key={preset.name}
                                    type="button"
                                    onClick={() => {
                                        setCustomConfig(preset.config);
                                        toast.success(`Loaded "${preset.name}" preset`);
                                    }}
                                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--bg-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-purple-500/40 text-left transition-all group cursor-pointer"
                                >
                                    <span className="text-lg">{preset.icon}</span>
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-purple-300">
                                            {preset.name}
                                        </p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: preset.config.primaryAccent }} />
                                            <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: preset.config.secondaryAccent }} />
                                            <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: preset.config.backgroundTint }} />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Interactive Customizer Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Column 1 & 2: Controls */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Base Mode */}
                            <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-4">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                    <Sun className="w-4 h-4 text-amber-400" />
                                    <span>1. Base Theme Mode</span>
                                </h4>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'dark', label: 'Dark Charcoal', desc: 'Balanced dark surfaces', icon: Moon },
                                        { id: 'oled', label: 'Pitch Black (OLED)', desc: 'True pure #000000 black', icon: Zap },
                                        { id: 'light', label: 'Clean Light', desc: 'Crisp high-contrast light', icon: Sun },
                                    ].map((mode) => {
                                        const Icon = mode.icon;
                                        const isSelected = customConfig.baseMode === mode.id;
                                        return (
                                            <button
                                                key={mode.id}
                                                type="button"
                                                onClick={() => setCustomConfig({ baseMode: mode.id as any })}
                                                className={cn(
                                                    "p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer",
                                                    isSelected
                                                        ? "bg-purple-500/15 border-purple-500/60 ring-2 ring-purple-500/30"
                                                        : "bg-[var(--bg-primary)] border-[var(--border)] hover:border-[var(--border-hover)]"
                                                )}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <Icon className={cn("w-5 h-5", isSelected ? "text-purple-400" : "text-[var(--text-muted)]")} />
                                                    {isSelected && <Check className="w-4 h-4 text-purple-400" />}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-xs text-[var(--text-primary)]">{mode.label}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{mode.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Primary Accent Color */}
                            <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                        <Flame className="w-4 h-4 text-rose-400" />
                                        <span>2. Primary Accent Color</span>
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={customConfig.primaryAccent}
                                            onChange={(e) => setCustomConfig({ primaryAccent: e.target.value })}
                                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                                            title="Pick exact color"
                                        />
                                        <input
                                            type="text"
                                            value={customConfig.primaryAccent}
                                            onChange={(e) => setCustomConfig({ primaryAccent: e.target.value })}
                                            className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] px-2.5 py-1 rounded-lg text-xs font-mono text-[var(--text-primary)]"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                                    {ACCENT_COLOR_SWATCHES.map((swatch) => {
                                        const isSelected = customConfig.primaryAccent.toLowerCase() === swatch.hex.toLowerCase();
                                        return (
                                            <button
                                                key={swatch.hex}
                                                type="button"
                                                onClick={() => setCustomConfig({ primaryAccent: swatch.hex })}
                                                className={cn(
                                                    "p-2.5 rounded-xl border flex items-center gap-2 transition-all cursor-pointer",
                                                    isSelected
                                                        ? "bg-[var(--bg-primary)] border-white/40 ring-2 ring-white/30"
                                                        : "bg-[var(--bg-primary)] border-[var(--border)] hover:border-[var(--border-hover)]"
                                                )}
                                            >
                                                <span className="w-4 h-4 rounded-full border border-black/20 shrink-0" style={{ backgroundColor: swatch.hex }} />
                                                <span className="text-[11px] font-semibold text-[var(--text-secondary)] truncate">{swatch.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Secondary Accent Color & Background Tint */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Secondary Accent */}
                                <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                            Secondary Accent
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={customConfig.secondaryAccent}
                                                onChange={(e) => setCustomConfig({ secondaryAccent: e.target.value })}
                                                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                                            />
                                            <input
                                                type="text"
                                                value={customConfig.secondaryAccent}
                                                onChange={(e) => setCustomConfig({ secondaryAccent: e.target.value })}
                                                className="w-20 bg-[var(--bg-primary)] border border-[var(--border)] px-2 py-0.5 rounded-lg text-xs font-mono text-[var(--text-primary)]"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {ACCENT_COLOR_SWATCHES.slice(0, 8).map((swatch) => (
                                            <button
                                                key={swatch.hex}
                                                type="button"
                                                onClick={() => setCustomConfig({ secondaryAccent: swatch.hex })}
                                                className={cn(
                                                    "w-7 h-7 rounded-full border transition-all cursor-pointer",
                                                    customConfig.secondaryAccent.toLowerCase() === swatch.hex.toLowerCase()
                                                        ? "ring-2 ring-white scale-110"
                                                        : "border-black/20 hover:scale-105"
                                                )}
                                                style={{ backgroundColor: swatch.hex }}
                                                title={swatch.label}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Background Tint */}
                                <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                            Background Tone
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={customConfig.backgroundTint}
                                                onChange={(e) => setCustomConfig({ backgroundTint: e.target.value })}
                                                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                                            />
                                            <input
                                                type="text"
                                                value={customConfig.backgroundTint}
                                                onChange={(e) => setCustomConfig({ backgroundTint: e.target.value })}
                                                className="w-20 bg-[var(--bg-primary)] border border-[var(--border)] px-2 py-0.5 rounded-lg text-xs font-mono text-[var(--text-primary)]"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {BACKGROUND_SWATCHES.map((swatch) => (
                                            <button
                                                key={swatch.hex}
                                                type="button"
                                                onClick={() => setCustomConfig({ backgroundTint: swatch.hex })}
                                                className={cn(
                                                    "w-7 h-7 rounded-full border transition-all cursor-pointer",
                                                    customConfig.backgroundTint.toLowerCase() === swatch.hex.toLowerCase()
                                                        ? "ring-2 ring-white scale-110"
                                                        : "border-white/20 hover:scale-105"
                                                )}
                                                style={{ backgroundColor: swatch.hex }}
                                                title={swatch.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Surface Style & Glow Intensity */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Surface Glassmorphism */}
                                <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-3">
                                    <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-blue-400" />
                                        <span>Surface & Glass Style</span>
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'glass', label: 'Glass' },
                                            { id: 'frosted', label: 'Frosted' },
                                            { id: 'solid', label: 'Solid' },
                                        ].map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setCustomConfig({ surfaceStyle: item.id as any })}
                                                className={cn(
                                                    "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer",
                                                    customConfig.surfaceStyle === item.id
                                                        ? "bg-purple-500/20 text-purple-300 border-purple-500/60 ring-1 ring-purple-500/40"
                                                        : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Glow Intensity */}
                                <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-3">
                                    <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-amber-400" />
                                        <span>Border Glow Intensity</span>
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'none', label: 'None' },
                                            { id: 'subtle', label: 'Subtle' },
                                            { id: 'vibrant', label: 'Vibrant' },
                                        ].map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setCustomConfig({ glowIntensity: item.id as any })}
                                                className={cn(
                                                    "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer",
                                                    customConfig.glowIntensity === item.id
                                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/60 ring-1 ring-amber-500/40"
                                                        : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Column 3: Live Real-Time Interactive Preview Card */}
                        <div className="space-y-6">
                            <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl sticky top-6 space-y-5">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                        <Eye className="w-4 h-4 text-emerald-400" />
                                        <span>Live UI Preview</span>
                                    </h4>
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                        Realtime
                                    </span>
                                </div>

                                {/* Simulated Application Window */}
                                <div 
                                    className="w-full rounded-2xl border p-4 select-none shadow-2xl flex flex-col gap-3 transition-colors duration-300"
                                    style={{ 
                                        backgroundColor: customConfig.baseMode === 'oled' ? '#000000' : customConfig.backgroundTint,
                                        borderColor: customConfig.primaryAccent + '40',
                                        boxShadow: customConfig.glowIntensity === 'vibrant' ? `0 0 25px ${customConfig.primaryAccent}35` : 'none'
                                    }}
                                >
                                    {/* Mock Title Bar */}
                                    <div 
                                        className="flex items-center justify-between p-2.5 rounded-xl border"
                                        style={{ 
                                            backgroundColor: customConfig.baseMode === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(20,25,40,0.85)',
                                            borderColor: customConfig.primaryAccent + '25'
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customConfig.primaryAccent }} />
                                            <span className="text-xs font-bold" style={{ color: customConfig.baseMode === 'light' ? '#0f172a' : '#ffffff' }}>
                                                ARK Server Manager
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: customConfig.primaryAccent + '20', color: customConfig.primaryAccent }}>
                                            v4.6.15
                                        </span>
                                    </div>

                                    {/* Mock Server Card */}
                                    <div 
                                        className="p-4 rounded-xl border flex flex-col gap-2.5"
                                        style={{ 
                                            backgroundColor: customConfig.baseMode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(15,20,34,0.9)',
                                            borderColor: customConfig.primaryAccent + '30'
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-xs font-bold" style={{ color: customConfig.baseMode === 'light' ? '#0f172a' : '#ffffff' }}>
                                                    The Island PvP Server
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#10b98120', color: '#10b981' }}>
                                                ONLINE
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t" style={{ borderColor: customConfig.primaryAccent + '20' }}>
                                            <div>
                                                <span className="block opacity-60 text-[9px] uppercase tracking-wider" style={{ color: customConfig.baseMode === 'light' ? '#64748b' : '#94a3b8' }}>Players</span>
                                                <span className="font-bold" style={{ color: customConfig.baseMode === 'light' ? '#0f172a' : '#ffffff' }}>24 / 70</span>
                                            </div>
                                            <div>
                                                <span className="block opacity-60 text-[9px] uppercase tracking-wider" style={{ color: customConfig.baseMode === 'light' ? '#64748b' : '#94a3b8' }}>Memory</span>
                                                <span className="font-bold" style={{ color: customConfig.baseMode === 'light' ? '#0f172a' : '#ffffff' }}>4.8 GB</span>
                                            </div>
                                        </div>

                                        {/* Action buttons inside mock */}
                                        <div className="flex gap-2 pt-1">
                                            <button 
                                                type="button" 
                                                className="flex-1 py-1.5 rounded-lg text-white font-bold text-[11px] shadow-sm"
                                                style={{ backgroundColor: customConfig.primaryAccent }}
                                            >
                                                Start Server
                                            </button>
                                            <button 
                                                type="button" 
                                                className="px-3 py-1.5 rounded-lg font-bold text-[11px] border"
                                                style={{ 
                                                    backgroundColor: customConfig.secondaryAccent + '20',
                                                    borderColor: customConfig.secondaryAccent + '40',
                                                    color: customConfig.secondaryAccent
                                                }}
                                            >
                                                RCON
                                            </button>
                                        </div>
                                    </div>

                                    {/* Mock Terminal Stream */}
                                    <div 
                                        className="p-2.5 rounded-lg border font-mono text-[10px] space-y-1"
                                        style={{ 
                                            backgroundColor: customConfig.baseMode === 'light' ? '#f1f5f9' : '#04060a',
                                            borderColor: customConfig.primaryAccent + '25',
                                            color: customConfig.primaryAccent
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="opacity-50">[12:45:00]</span>
                                            <span>[RCON] Server auto-save complete.</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 opacity-80" style={{ color: customConfig.secondaryAccent }}>
                                            <span className="opacity-50">[12:45:05]</span>
                                            <span>[Watchdog] Heartbeat OK. Ping: 24ms</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Big Apply CTA Button */}
                                <button
                                    type="button"
                                    onClick={handleApplyCustomTheme}
                                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-purple-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Sparkles className="w-5 h-5 text-amber-300" />
                                    <span>Apply Custom Theme Now</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
