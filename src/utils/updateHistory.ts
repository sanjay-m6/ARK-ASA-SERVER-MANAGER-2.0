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
    autoUpdate: boolean;
    lastCheck: string | null;
    skippedVersions: string[];
}

const HISTORY_KEY = 'update_history';
const SETTINGS_KEY = 'update_settings';

// Default settings
const DEFAULT_SETTINGS: UpdateSettings = {
    autoUpdate: true,
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

    if (!settings.autoUpdate) {
        return false;
    }

    if (!settings.lastCheck) {
        return true;
    }

    const lastCheck = new Date(settings.lastCheck).getTime();
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 24 hours

    return now - lastCheck >= interval;
}

// Update last check timestamp
export function updateLastCheck(): void {
    setUpdateSettings({ lastCheck: new Date().toISOString() });
}

// Get interval in milliseconds for setInterval
export function getCheckIntervalMs(): number | null {
    const settings = getUpdateSettings();

    if (!settings.autoUpdate) {
        return null;
    }

    return 24 * 60 * 60 * 1000; // 24 hours
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

// Compare two semver version strings (e.g., "2.3.4" vs "2.3.1")
// Returns: positive if a > b, negative if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Remove skipped versions that are at or below the current installed version
export function pruneSkippedVersions(currentVersion: string): void {
    const settings = getUpdateSettings();
    const validSkips = settings.skippedVersions.filter(v =>
        compareVersions(v, currentVersion) > 0
    );
    if (validSkips.length !== settings.skippedVersions.length) {
        setUpdateSettings({ skippedVersions: validSkips });
    }
}

// Full reset of update cache — clears all settings and history
export function resetUpdateCache(): void {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SETTINGS_KEY);
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
