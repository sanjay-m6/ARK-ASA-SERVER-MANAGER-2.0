import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { emit, listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { Download, X, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../utils/helpers';
import {
    addUpdateHistory,
    updateLastCheck,
    shouldCheckForUpdates,
    getCheckIntervalMs,
    isVersionSkipped,
    skipVersion
} from '../utils/updateHistory';

// Export types for use in Settings
export interface UpdateInfo {
    version: string;
    body: string;
}

export interface UpdateCheckResult {
    available: boolean;
    update: UpdateInfo | null;
    error: string | null;
}

// Singleton state for cross-component access
let lastCheckResult: UpdateCheckResult = { available: false, update: null, error: null };
let checkInProgress = false;

// Helpers to manage check lock with timeout
const acquireCheckLock = () => {
    if (checkInProgress) return false;
    checkInProgress = true;
    // Safety timeout: release lock after 30 seconds if getting stuck
    setTimeout(() => {
        if (checkInProgress) {
            checkInProgress = false;
        }
    }, 30000);
    return true;
};

const releaseCheckLock = () => {
    checkInProgress = false;
};

// Export function for manual trigger from Settings
export async function manualCheckForUpdates(): Promise<UpdateCheckResult> {
    if (!acquireCheckLock()) {
        return lastCheckResult;
    }

    try {
        const update = await check();
        updateLastCheck();

        if (update) {
            lastCheckResult = {
                available: true,
                update: {
                    version: update.version,
                    body: update.body || 'New version available!', // Keep hardcoded fallback for manual check logic or pass t func
                },
                error: null,
            };
            // Notify UI to show banner
            await emit('update-found', lastCheckResult.update);
        } else {
            lastCheckResult = {
                available: false,
                update: null,
                error: null,
            };
        }
    } catch (err) {
        console.error('Update check failed:', err);
        lastCheckResult = {
            available: false,
            update: null,
            error: err instanceof Error ? err.message : 'Failed to check for updates',
        };
        await emit('update-error', lastCheckResult.error);
    } finally {
        releaseCheckLock();
    }

    return lastCheckResult;
}

export default function UpdateChecker() {
    const { t } = useTranslation();
    const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
    const [updateObj, setUpdateObj] = useState<Awaited<ReturnType<typeof check>> | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [showBanner, setShowBanner] = useState(false);
    const [settingsRevision, setSettingsRevision] = useState(0); // Used to trigger interval restart
    const [currentAppVersion, setCurrentAppVersion] = useState<string>('');

    // Load current version on mount
    useEffect(() => {
        getVersion().then(setCurrentAppVersion).catch(console.error);
    }, []);

    const checkForUpdates = useCallback(async (isManual = false) => {
        if (!isManual && checkInProgress) return;
        if (!isManual && !acquireCheckLock()) return;

        try {
            const update = await check();
            updateLastCheck();

            if (update) {
                // Check if user skipped this version
                if (!isManual && isVersionSkipped(update.version)) {
                    console.log(`Version ${update.version} was skipped by user`);
                    return;
                }

                const info = {
                    version: update.version,
                    body: update.body || t('updateChecker.title'), // Fallback title as body if empty
                };

                setUpdateAvailable(info);
                setUpdateObj(update);
                setShowBanner(true);

                lastCheckResult = {
                    available: true,
                    update: info,
                    error: null,
                };
            }
        } catch (err) {
            console.error('Update check failed:', err);
        } finally {
            if (!isManual) releaseCheckLock();
        }
    }, []);

    const handleSkipVersion = () => {
        if (updateAvailable) {
            skipVersion(updateAvailable.version);
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'skipped',
                previousVersion: currentAppVersion,
            });
            setShowBanner(false);
        }
    };

    const downloadAndInstall = async () => {
        if (!updateObj || !updateAvailable) return;

        setIsDownloading(true);
        setError(null);

        try {
            let downloaded = 0;
            let totalSize = 0;

            await updateObj.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                    totalSize = event.data.contentLength || 0;
                }
                if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;
                    const progress = totalSize > 0
                        ? (downloaded / totalSize) * 100
                        : 0;
                    setDownloadProgress(progress);
                }
            });

            // Log successful update
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'installed',
                previousVersion: currentAppVersion,
            });

            console.log("Update installed, relaunching...");
            await relaunch();
        } catch (err) {
            console.error('Update failed:', err);
            setError(t('updateChecker.error'));

            // Log failed update
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'failed',
                previousVersion: currentAppVersion,
            });

            setIsDownloading(false);
        }
    };

    // Listen for settings changes to restart interval
    useEffect(() => {
        const handleSettingsChange = () => {
            console.log("Update settings changed, restarting interval...");
            setSettingsRevision(prev => prev + 1);
        };

        window.addEventListener('update-settings-changed', handleSettingsChange);
        return () => window.removeEventListener('update-settings-changed', handleSettingsChange);
    }, []);

    // Scheduled interval checks
    useEffect(() => {
        const intervalMs = getCheckIntervalMs();
        console.log(`Setting update check interval: ${intervalMs ? intervalMs / 1000 + 's' : 'Disabled'}`);

        if (!intervalMs) {
            return; // Interval is 'never'
        }

        // Initial check if needed
        if (shouldCheckForUpdates()) {
            checkForUpdates();
        }

        const intervalId = setInterval(() => {
            if (shouldCheckForUpdates()) {
                checkForUpdates();
            }
        }, Math.min(intervalMs, 3600000)); // Check at most every hour

        return () => clearInterval(intervalId);
    }, [checkForUpdates, settingsRevision]); // Restart when settingsRevision changes

    // Initial check after 5 seconds startup
    useEffect(() => {
        const timer = setTimeout(() => {
            if (shouldCheckForUpdates()) {
                checkForUpdates();
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [checkForUpdates]);

    // Listen for manual check events
    useEffect(() => {
        let unlistenUpdate: (() => void) | null = null;
        let unlistenError: (() => void) | null = null;

        const setupListeners = async () => {
            unlistenUpdate = await listen<UpdateInfo>('update-found', (event) => {
                setUpdateAvailable(event.payload);
                setShowBanner(true);
            });

            unlistenError = await listen<string>('update-error', (event) => {
                // For manual checks, we might want to show this in the banner too if open?
                // But usually this is handled by the caller (Settings page)
                // We'll just log it here
                console.warn("Update error received:", event.payload);
            });
        };

        setupListeners();

        return () => {
            if (unlistenUpdate) unlistenUpdate();
            if (unlistenError) unlistenError();
        };
    }, []);

    if (!showBanner || !updateAvailable) return null;

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 max-w-sm w-full",
            "bg-slate-900/80 backdrop-blur-xl",
            "border border-slate-700/50 rounded-2xl shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-4 duration-500",
            "before:absolute before:inset-0 before:-z-10 before:rounded-2xl before:bg-gradient-to-b before:from-sky-500/10 before:to-transparent"
        )}>
            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-sky-500/20 rounded-xl blur-md"></div>
                            <div className="relative p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30">
                                <Download className="w-5 h-5 text-sky-400" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-base">{t('updateChecker.title')}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/50 text-[11px] font-mono text-slate-400">v{currentAppVersion}</span>
                                <span className="text-slate-500">→</span>
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[11px] font-mono text-sky-400 font-medium tracking-wide">v{updateAvailable.version}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowBanner(false)}
                        className="p-1.5 hover:bg-slate-800/80 rounded-lg transition-all text-slate-500 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="bg-slate-950/40 rounded-xl p-3.5 mb-5 border border-slate-800/50 max-h-32 overflow-y-auto custom-scrollbar shadow-inner">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {updateAvailable.body}
                    </p>
                </div>

                {error && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs mb-4">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {isDownloading && (
                    <div className="mb-5 space-y-2.5">
                        <div className="flex justify-between text-xs font-medium text-sky-200/70">
                            <span className="flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                                {t('updateChecker.downloading')}
                            </span>
                            <span className="text-sky-400 font-mono">{Math.round(downloadProgress)}%</span>
                        </div>
                        <div className="relative h-2 w-full bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                            <div
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                                style={{ width: `${downloadProgress}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2.5">
                    <button
                        onClick={downloadAndInstall}
                        disabled={isDownloading}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl",
                            "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500",
                            "text-white font-bold text-xs tracking-wider uppercase",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 border border-t-white/10"
                        )}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                {t('updateChecker.installing')}
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                {t('updateChecker.updateNow')}
                            </>
                        )}
                    </button>

                    {!isDownloading && (
                        <>
                            <button
                                onClick={handleSkipVersion}
                                title={t('updateChecker.skip')}
                                className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700/50 hover:border-slate-600"
                            >
                                <Clock className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowBanner(false)}
                                className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700/50 hover:border-slate-600 text-xs font-bold uppercase tracking-wider"
                            >
                                {t('updateChecker.later')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
