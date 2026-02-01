import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { emit, listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { Download, X, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
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
                    body: update.body || 'New version available!',
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
                    body: update.body || 'New version available!',
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
            setError('Failed to download update. Please try again or download manually.');

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
            "bg-slate-900",
            "border border-slate-700 rounded-xl shadow-2xl shadow-black/50 animate-in slide-in-from-bottom-2 duration-300"
        )}>
            <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                            <Download className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm">Update Available</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">v{currentAppVersion}</span>
                                <span className="text-slate-600">→</span>
                                <span className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-[10px] font-mono text-green-400">v{updateAvailable.version}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowBanner(false)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="bg-slate-950/50 rounded-lg p-3 mb-4 border border-slate-800/50 max-h-32 overflow-y-auto custom-scrollbar">
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {updateAvailable.body}
                    </p>
                </div>

                {error && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-xs mb-3">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {isDownloading && (
                    <div className="mb-3 space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Downloading...</span>
                            <span>{Math.round(downloadProgress)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-sky-500 transition-all duration-300 ease-out"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={downloadAndInstall}
                        disabled={isDownloading}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
                            "bg-sky-600 hover:bg-sky-500 active:bg-sky-700",
                            "text-white font-bold text-xs tracking-wide uppercase",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-all duration-200 shadow-lg shadow-sky-500/20"
                        )}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Installing...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-3.5 h-3.5" />
                                Update Now
                            </>
                        )}
                    </button>

                    {!isDownloading && (
                        <>
                            <button
                                onClick={handleSkipVersion}
                                title="Skip this version"
                                className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
                            >
                                <Clock className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowBanner(false)}
                                className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 text-xs font-bold uppercase tracking-wide"
                            >
                                Later
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
