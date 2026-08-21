import { create } from 'zustand';
import { getSetting, setSetting } from '../utils/tauri';

export type AppTheme = 
    | 'aurora-dark' 
    | 'midnight-blue' 
    | 'cyber-neon' 
    | 'arctic-light'
    | 'forest-emerald'
    | 'obsidian-purple'
    | 'crimson-ember'
    | 'synthwave-sunset'
    | 'solar-amber'
    | 'matrix-terminal'
    | 'custom';

export interface ThemeMeta {
    id: AppTheme;
    name: string;
    description: string;
    category: 'dark' | 'light' | 'special';
    badge?: string;
    colors: {
        background: string;
        card: string;
        accent: string;
        accentSecondary?: string;
        statusSuccess: string;
        border: string;
        textPrimary: string;
    };
}

export interface CustomThemeConfig {
    baseMode: 'dark' | 'oled' | 'light';
    primaryAccent: string;
    secondaryAccent: string;
    backgroundTint: string;
    surfaceStyle: 'glass' | 'frosted' | 'solid';
    glowIntensity: 'none' | 'subtle' | 'vibrant';
    borderRadius: 'rounded' | 'medium' | 'sharp';
}

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
    baseMode: 'dark',
    primaryAccent: '#0ea5e9',
    secondaryAccent: '#818cf8',
    backgroundTint: '#0a0d14',
    surfaceStyle: 'glass',
    glowIntensity: 'subtle',
    borderRadius: 'rounded',
};

export const AVAILABLE_THEMES: ThemeMeta[] = [
    {
        id: 'aurora-dark',
        name: 'Aurora Dark',
        description: 'Deep charcoal background with subtle blue-purple glass cards and cyan highlights. Optimized for server management sessions.',
        category: 'dark',
        badge: 'Default',
        colors: {
            background: '#0a0d14',
            card: '#0e121b',
            accent: '#0ea5e9',
            accentSecondary: '#818cf8',
            statusSuccess: '#10b981',
            border: 'rgba(255, 255, 255, 0.08)',
            textPrimary: '#f8fafc',
        }
    },
    {
        id: 'midnight-blue',
        name: 'Midnight Blue',
        description: 'Professional navy-blue dark theme with vibrant royal blue accents and crisp high-contrast monitoring dashboards.',
        category: 'dark',
        badge: 'Enterprise',
        colors: {
            background: '#070d1d',
            card: '#0c1630',
            accent: '#2563eb',
            accentSecondary: '#0284c7',
            statusSuccess: '#10b981',
            border: 'rgba(59, 130, 246, 0.18)',
            textPrimary: '#ffffff',
        }
    },
    {
        id: 'cyber-neon',
        name: 'Cyber Neon',
        description: 'High-tech gaming theme featuring pitch black surfaces, electric neon cyan accents, vivid magenta highlights, and subtle borders.',
        category: 'special',
        badge: 'Futuristic',
        colors: {
            background: '#030508',
            card: '#080c14',
            accent: '#00f0ff',
            accentSecondary: '#d946ef',
            statusSuccess: '#00ff88',
            border: 'rgba(0, 240, 255, 0.25)',
            textPrimary: '#f0fdf4',
        }
    },
    {
        id: 'forest-emerald',
        name: 'Forest Emerald',
        description: 'Bio-Ark inspired nature theme with deep lush moss charcoal surfaces, glowing emerald highlights, and fresh mint status indicators.',
        category: 'dark',
        badge: 'Bio-Ark',
        colors: {
            background: '#05130b',
            card: '#0a1d12',
            accent: '#10b981',
            accentSecondary: '#84cc16',
            statusSuccess: '#22c55e',
            border: 'rgba(16, 185, 129, 0.22)',
            textPrimary: '#f0fdf4',
        }
    },
    {
        id: 'obsidian-purple',
        name: 'Obsidian Purple',
        description: 'Mystic dark amethyst theme with rich violet accents, glowing neon magenta highlights, and sleek dark purple crystal glass cards.',
        category: 'special',
        badge: 'Mystic',
        colors: {
            background: '#0d0818',
            card: '#140c26',
            accent: '#a855f7',
            accentSecondary: '#ec4899',
            statusSuccess: '#10b981',
            border: 'rgba(168, 85, 247, 0.22)',
            textPrimary: '#faf5ff',
        }
    },
    {
        id: 'crimson-ember',
        name: 'Crimson Ember',
        description: 'Volcanic magma theme with deep charred dark surfaces, fiery crimson red accents, and molten amber highlight indicators.',
        category: 'special',
        badge: 'Volcanic',
        colors: {
            background: '#120707',
            card: '#1c0c0c',
            accent: '#ef4444',
            accentSecondary: '#f97316',
            statusSuccess: '#10b981',
            border: 'rgba(239, 68, 68, 0.25)',
            textPrimary: '#fff1f2',
        }
    },
    {
        id: 'synthwave-sunset',
        name: 'Synthwave Sunset',
        description: 'Retro 80s neon aesthetic with deep ultraviolet night surfaces, vibrant neon hot pink accents, and sunset orange glows.',
        category: 'special',
        badge: 'Retro 80s',
        colors: {
            background: '#0e091b',
            card: '#160e2c',
            accent: '#f43f5e',
            accentSecondary: '#fb923c',
            statusSuccess: '#00ff88',
            border: 'rgba(244, 63, 94, 0.25)',
            textPrimary: '#fff1f2',
        }
    },
    {
        id: 'solar-amber',
        name: 'Solar Amber',
        description: 'Warm desert twilight theme with rich dark bronze surfaces, radiant gold highlights, and glowing amber active elements.',
        category: 'dark',
        badge: 'Desert Gold',
        colors: {
            background: '#130e06',
            card: '#1f1609',
            accent: '#f59e0b',
            accentSecondary: '#fbbf24',
            statusSuccess: '#10b981',
            border: 'rgba(245, 158, 11, 0.22)',
            textPrimary: '#fffbeb',
        }
    },
    {
        id: 'matrix-terminal',
        name: 'Matrix Terminal',
        description: 'Pro hacker console theme with pure phosphor deep black background, intense cyber green text, and terminal lime highlights.',
        category: 'special',
        badge: 'Cyber Pro',
        colors: {
            background: '#020a04',
            card: '#051408',
            accent: '#22c55e',
            accentSecondary: '#4ade80',
            statusSuccess: '#22c55e',
            border: 'rgba(34, 197, 94, 0.25)',
            textPrimary: '#dcfce7',
        }
    },
    {
        id: 'arctic-light',
        name: 'Arctic Light',
        description: 'Clean, modern light theme with soft slate-gray surfaces, deep readable dark typography, and sapphire blue highlights.',
        category: 'light',
        badge: 'High Readability',
        colors: {
            background: '#f8fafc',
            card: '#ffffff',
            accent: '#0284c7',
            accentSecondary: '#6366f1',
            statusSuccess: '#059669',
            border: 'rgba(15, 23, 42, 0.12)',
            textPrimary: '#0f172a',
        }
    }
];

// Helper to convert hex to RGBA
export const hexToRgba = (hex: string, alpha: number): string => {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return `rgba(14, 165, 233, ${alpha})`;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const applyCustomThemeToDOM = (customConfig: CustomThemeConfig) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    
    const isLight = customConfig.baseMode === 'light';
    const isOled = customConfig.baseMode === 'oled';

    const bgPrimary = isOled ? '#000000' : isLight ? (customConfig.backgroundTint || '#f8fafc') : (customConfig.backgroundTint || '#0a0d14');
    const primaryAccent = customConfig.primaryAccent || '#0ea5e9';
    const secondaryAccent = customConfig.secondaryAccent || '#818cf8';

    // Surface calculation based on style
    let surfaceBg = '';
    let surfaceHover = '';
    let surfaceActive = '';
    let border = '';
    let borderHover = '';
    let textPrimary = '';
    let textSecondary = '';
    let textMuted = '';

    if (isLight) {
        surfaceBg = customConfig.surfaceStyle === 'solid' ? '#ffffff' : 'rgba(255, 255, 255, 0.94)';
        surfaceHover = 'rgba(241, 245, 249, 0.98)';
        surfaceActive = 'rgba(226, 232, 240, 1)';
        border = hexToRgba(primaryAccent, 0.2);
        borderHover = hexToRgba(primaryAccent, 0.5);
        textPrimary = '#0f172a';
        textSecondary = '#334155';
        textMuted = '#64748b';
    } else if (isOled) {
        surfaceBg = customConfig.surfaceStyle === 'solid' ? '#080808' : 'rgba(10, 10, 10, 0.92)';
        surfaceHover = 'rgba(20, 20, 20, 0.96)';
        surfaceActive = 'rgba(32, 32, 32, 1)';
        border = hexToRgba(primaryAccent, customConfig.glowIntensity === 'vibrant' ? 0.35 : 0.2);
        borderHover = hexToRgba(primaryAccent, 0.7);
        textPrimary = '#ffffff';
        textSecondary = hexToRgba(primaryAccent, 0.85);
        textMuted = '#94a3b8';
    } else {
        surfaceBg = customConfig.surfaceStyle === 'solid' ? '#0f1422' : 'rgba(15, 20, 34, 0.88)';
        surfaceHover = 'rgba(24, 32, 54, 0.94)';
        surfaceActive = 'rgba(36, 48, 78, 0.98)';
        border = hexToRgba(primaryAccent, customConfig.glowIntensity === 'vibrant' ? 0.3 : 0.16);
        borderHover = hexToRgba(primaryAccent, 0.6);
        textPrimary = '#f8fafc';
        textSecondary = '#94a3b8';
        textMuted = '#64748b';
    }

    const glow = customConfig.glowIntensity === 'none' 
        ? 'none' 
        : customConfig.glowIntensity === 'vibrant' 
            ? `0 0 25px ${hexToRgba(primaryAccent, 0.45)}` 
            : `0 0 15px ${hexToRgba(primaryAccent, 0.25)}`;

    // Set custom CSS variables on document root
    root.style.setProperty('--bg-primary', bgPrimary);
    root.style.setProperty('--surface', surfaceBg);
    root.style.setProperty('--surface-hover', surfaceHover);
    root.style.setProperty('--surface-active', surfaceActive);
    root.style.setProperty('--border', border);
    root.style.setProperty('--border-hover', borderHover);
    root.style.setProperty('--text-primary', textPrimary);
    root.style.setProperty('--text-secondary', textSecondary);
    root.style.setProperty('--text-muted', textMuted);
    root.style.setProperty('--accent', primaryAccent);
    root.style.setProperty('--accent-hover', primaryAccent);
    root.style.setProperty('--accent-soft', hexToRgba(primaryAccent, 0.15));
    root.style.setProperty('--accent-secondary', secondaryAccent);
    root.style.setProperty('--button-primary', primaryAccent);
    root.style.setProperty('--glow', glow);
    root.style.setProperty('--glass-panel-bg', surfaceBg);
    root.style.setProperty('--glass-panel-border', border);
    root.style.setProperty('--game-accent', primaryAccent);
    root.style.setProperty('--game-accent-glow', hexToRgba(primaryAccent, 0.4));
};

export const clearCustomThemeVariables = () => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const props = [
        '--bg-primary', '--surface', '--surface-hover', '--surface-active',
        '--border', '--border-hover', '--text-primary', '--text-secondary',
        '--text-muted', '--accent', '--accent-hover', '--accent-soft',
        '--accent-secondary', '--button-primary', '--glow', '--glass-panel-bg',
        '--glass-panel-border', '--game-accent', '--game-accent-glow'
    ];
    props.forEach(p => root.style.removeProperty(p));
};

export const applyThemeToDOM = (theme: AppTheme, customConfig?: CustomThemeConfig) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    
    // Clear any theme class tokens
    const allThemeClasses = AVAILABLE_THEMES.map(t => `theme-${t.id}`).concat(['theme-custom', 'light', 'dark']);
    root.classList.remove(...allThemeClasses);
    root.classList.add(`theme-${theme}`);
    
    if (theme === 'custom' && customConfig) {
        root.classList.add(customConfig.baseMode === 'light' ? 'light' : 'dark');
        applyCustomThemeToDOM(customConfig);
    } else {
        clearCustomThemeVariables();
        if (theme === 'arctic-light') {
            root.classList.add('light');
        } else {
            root.classList.add('dark');
        }
    }
};

const getInitialTheme = (): AppTheme => {
    if (typeof window === 'undefined') return 'aurora-dark';
    try {
        const stored = localStorage.getItem('ark-app-theme') as AppTheme | null;
        if (stored) return stored;
    } catch {
        // Ignore localStorage error
    }
    return 'aurora-dark';
};

const getInitialCustomConfig = (): CustomThemeConfig => {
    if (typeof window === 'undefined') return DEFAULT_CUSTOM_THEME;
    try {
        const stored = localStorage.getItem('ark-custom-theme-config');
        if (stored) {
            return { ...DEFAULT_CUSTOM_THEME, ...JSON.parse(stored) };
        }
    } catch {
        // Ignore
    }
    return DEFAULT_CUSTOM_THEME;
};

interface ThemeStore {
    theme: AppTheme;
    customConfig: CustomThemeConfig;
    setTheme: (theme: AppTheme) => void;
    setCustomConfig: (config: Partial<CustomThemeConfig>) => void;
    resetCustomTheme: () => void;
    initTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: getInitialTheme(),
    customConfig: getInitialCustomConfig(),
    setTheme: (newTheme: AppTheme) => {
        try {
            localStorage.setItem('ark-app-theme', newTheme);
            setSetting('app_theme', newTheme).catch(() => {});
        } catch (e) {
            console.error('Failed to persist theme:', e);
        }
        const currentCustomConfig = get().customConfig;
        applyThemeToDOM(newTheme, currentCustomConfig);
        set({ theme: newTheme });
    },
    setCustomConfig: (updates: Partial<CustomThemeConfig>) => {
        const updated = { ...get().customConfig, ...updates };
        try {
            localStorage.setItem('ark-custom-theme-config', JSON.stringify(updated));
            setSetting('app_custom_theme_config', JSON.stringify(updated)).catch(() => {});
        } catch (e) {
            console.error('Failed to persist custom theme config:', e);
        }
        if (get().theme === 'custom') {
            applyThemeToDOM('custom', updated);
        }
        set({ customConfig: updated });
    },
    resetCustomTheme: () => {
        try {
            localStorage.setItem('ark-custom-theme-config', JSON.stringify(DEFAULT_CUSTOM_THEME));
            setSetting('app_custom_theme_config', JSON.stringify(DEFAULT_CUSTOM_THEME)).catch(() => {});
        } catch (e) {
            console.error('Failed to reset custom theme:', e);
        }
        if (get().theme === 'custom') {
            applyThemeToDOM('custom', DEFAULT_CUSTOM_THEME);
        }
        set({ customConfig: DEFAULT_CUSTOM_THEME });
    },
    initTheme: async () => {
        let currentTheme = getInitialTheme();
        let customCfg = getInitialCustomConfig();
        try {
            const dbTheme = await getSetting('app_theme');
            if (dbTheme) {
                currentTheme = dbTheme as AppTheme;
                localStorage.setItem('ark-app-theme', currentTheme);
            }
            const dbCustomCfg = await getSetting('app_custom_theme_config');
            if (dbCustomCfg) {
                customCfg = { ...DEFAULT_CUSTOM_THEME, ...JSON.parse(dbCustomCfg) };
                localStorage.setItem('ark-custom-theme-config', JSON.stringify(customCfg));
            }
        } catch {
            // Fallback to localStorage
        }
        applyThemeToDOM(currentTheme, customCfg);
        set({ theme: currentTheme, customConfig: customCfg });
    }
}));
