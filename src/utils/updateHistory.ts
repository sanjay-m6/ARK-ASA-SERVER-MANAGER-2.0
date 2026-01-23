// Update history and settings utilities
// Stores data in localStorage for simplicity

export interface UpdateHistoryEntry {
    id: string;
    version: string;
    date: string;
    action: 'installed' | 'skipped' | 'failed';
    previousVersion?: string;
}

export interface UpdateSettings {
    checkInterval: 'never' | '1h' | '6h' | '12h' | '24h';
    lastCheck: string | null;
    skippedVersions: string[];
}

const HISTORY_KEY = 'update_history';
const SETTINGS_KEY = 'update_settings';

// Default settings
const DEFAULT_SETTINGS: UpdateSettings = {
    checkInterval: '24h',
    lastCheck: null,
    skippedVersions: [],
};

// Get update history
export function getUpdateHistory(): UpdateHistoryEntry[] {
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// Add entry to update history
export function addUpdateHistory(entry: Omit<UpdateHistoryEntry, 'id' | 'date'>): void {
    const history = getUpdateHistory();
    const newEntry: UpdateHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
    };

    // Keep last 50 entries
    history.unshift(newEntry);
    if (history.length > 50) {
        history.pop();
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// Get update settings
export function getUpdateSettings(): UpdateSettings {
    try {
        const data = localStorage.getItem(SETTINGS_KEY);
        return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

// Save update settings
export function setUpdateSettings(settings: Partial<UpdateSettings>): void {
    const current = getUpdateSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
}

// Check if we should auto-check for updates based on interval
export function shouldCheckForUpdates(): boolean {
    const settings = getUpdateSettings();

    if (settings.checkInterval === 'never') {
        return false;
    }

    if (!settings.lastCheck) {
        return true;
    }

    const lastCheck = new Date(settings.lastCheck).getTime();
    const now = Date.now();

    const intervals: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
    };

    const interval = intervals[settings.checkInterval] || intervals['24h'];
    return now - lastCheck >= interval;
}

// Update last check timestamp
export function updateLastCheck(): void {
    setUpdateSettings({ lastCheck: new Date().toISOString() });
}

// Get interval in milliseconds for setInterval
export function getCheckIntervalMs(): number | null {
    const settings = getUpdateSettings();

    if (settings.checkInterval === 'never') {
        return null;
    }

    const intervals: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
    };

    return intervals[settings.checkInterval] || intervals['24h'];
}

// Check if a version is skipped
export function isVersionSkipped(version: string): boolean {
    const settings = getUpdateSettings();
    return settings.skippedVersions.includes(version);
}

// Skip a version
export function skipVersion(version: string): void {
    const settings = getUpdateSettings();
    if (!settings.skippedVersions.includes(version)) {
        setUpdateSettings({
            skippedVersions: [...settings.skippedVersions, version],
        });
    }
}

// Clear skipped versions
export function clearSkippedVersions(): void {
    setUpdateSettings({ skippedVersions: [] });
}

// Get GitHub releases URL for manual rollback
export function getReleasesUrl(): string {
    return 'https://github.com/sanjay-m6/ASA-SERVER-MANAGER-2.0/releases';
}

// Format relative time for display
export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}
