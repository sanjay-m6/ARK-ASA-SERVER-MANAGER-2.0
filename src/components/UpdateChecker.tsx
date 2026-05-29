import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { emit, listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { Download, X, RefreshCw, AlertCircle, Clock, Rocket, ExternalLink } from 'lucide-react';
import { cn } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
    addUpdateHistory,
    updateLastCheck,
    shouldCheckForUpdates,
    getCheckIntervalMs,
    isVersionSkipped,
    skipVersion,
    pruneSkippedVersions,
    getUpdateSettings,
    getReleasesUrl,
    setUpdateSettings as saveUpdateSettings
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

// Detect signature mismatch errors
function isSignatureError(errorMsg: string): boolean {
    return errorMsg.includes('different key') ||
           errorMsg.includes('signature') ||
           errorMsg.includes('Signature verification failed');
}

// Detect transient/network errors worth retrying
function isTransientError(errorMsg: string): boolean {
    return errorMsg.includes('network') ||
           errorMsg.includes('timeout') ||
           errorMsg.includes('ETIMEDOUT') ||
           errorMsg.includes('ECONNRESET') ||
           errorMsg.includes('fetch') ||
           errorMsg.includes('Could not fetch a valid release JSON');
}

// Retry helper with exponential backoff
async function withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelayMs: number = 5000
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const errorMsg = err instanceof Error ? err.message : String(err);

            // Don't retry signature errors — they'll never self-resolve
            if (isSignatureError(errorMsg)) {
                throw err;
            }

            // Only retry transient errors
            if (!isTransientError(errorMsg) || attempt === maxAttempts - 1) {
                throw err;
            }

            const delay = baseDelayMs * Math.pow(2, attempt);
            console.log(`Update check attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

// Open the releases page for manual download
async function openReleasesPage() {
    try {
        await invoke('plugin:opener|open_url', { url: getReleasesUrl() });
    } catch {
        // Fallback: try window.open
        window.open(getReleasesUrl(), '_blank');
    }
}

// Export function for manual trigger from Settings
export async function manualCheckForUpdates(): Promise<UpdateCheckResult> {
    if (!acquireCheckLock()) {
        return lastCheckResult;
    }

    try {
        const settings = getUpdateSettings();
        const target = settings.updateChannel || 'release';

        const update = await withRetry(() => check({ target }));
        updateLastCheck();
        saveUpdateSettings({ lastError: null });

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
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isReleaseJsonError = errorMsg.includes('Could not fetch a valid release JSON');
        const isDev = (import.meta as any).env?.DEV;
        
        if (isDev) {
            if (isReleaseJsonError) {
                console.warn('Update check: Remote release JSON not configured or reachable (expected in development).');
            } else {
                console.warn('Update check failed in dev mode:', err);
            }
        } else {
            console.error('Update check failed:', err);
        }

        const friendlyError = isSignatureError(errorMsg)
            ? 'Update signature mismatch. Please download the latest version manually from GitHub.'
            : isReleaseJsonError
                ? 'Update server is unreachable (local development / offline)'
                : errorMsg;

        lastCheckResult = {
            available: false,
            update: null,
            error: friendlyError,
        };
        saveUpdateSettings({ lastError: friendlyError });
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
    
    // UI States: 'hidden' | 'prompt' | 'downloading' | 'ready'
    const [uiState, setUiState] = useState<'hidden' | 'prompt' | 'downloading' | 'ready'>('hidden');
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSignatureMismatch, setIsSignatureMismatch] = useState(false);
    
    const [settingsRevision, setSettingsRevision] = useState(0); // Used to trigger interval restart
    const [currentAppVersion, setCurrentAppVersion] = useState<string>('');

    // Refs to avoid stale closures — the core fix for "nothing happens"
    const updateObjRef = useRef(updateObj);
    const updateAvailableRef = useRef(updateAvailable);
    const currentAppVersionRef = useRef(currentAppVersion);

    useEffect(() => { updateObjRef.current = updateObj; }, [updateObj]);
    useEffect(() => { updateAvailableRef.current = updateAvailable; }, [updateAvailable]);
    useEffect(() => { currentAppVersionRef.current = currentAppVersion; }, [currentAppVersion]);

    const downloadAndInstall = useCallback(async (
        updater?: Awaited<ReturnType<typeof check>> | null, 
        info?: {version: string} | null, 
        silent: boolean = false
    ) => {
        // Use refs as fallback to prevent stale closure reads
        const resolvedUpdater = updater ?? updateObjRef.current;
        const resolvedInfo = info ?? updateAvailableRef.current;

        if (!resolvedUpdater || !resolvedInfo) return;

        if (!silent) {
            setUiState('downloading');
        }
        setError(null);
        setIsSignatureMismatch(false);

        try {
            let downloaded = 0;
            let totalSize = 0;

            await resolvedUpdater.downloadAndInstall((event) => {
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
                version: resolvedInfo.version,
                action: 'installed',
                previousVersion: currentAppVersionRef.current,
            });

            saveUpdateSettings({ lastError: null });
            setUiState('ready'); // Prompt user to restart
        } catch (err) {
            console.error('Update failed:', err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            const sigError = isSignatureError(errorMsg);
            
            setIsSignatureMismatch(sigError);

            const friendlyMsg = sigError
                ? t('updateChecker.signatureError', 'The update signature does not match. This usually means the update was signed with a different key. Please download the latest version manually from GitHub Releases.')
                : `${t('updateChecker.error', 'Update failed')}: ${errorMsg}`;

            setError(friendlyMsg);

            // Log failed update
            addUpdateHistory({
                version: resolvedInfo.version,
                action: 'failed',
                previousVersion: currentAppVersionRef.current,
            });

            saveUpdateSettings({ lastError: friendlyMsg });

            if (!silent) {
                setUiState('prompt'); // Revert to prompt to show error
            } else {
                // For silent failures, show a toast so user knows something went wrong
                if (sigError) {
                    toast.error(
                        t('updateChecker.signatureToast', 'Update failed: signature mismatch. Check Settings → Updates for details.'),
                        { duration: 8000, icon: '⚠️' }
                    );
                }
            }
        }
    }, [t]);

    // Load current version on mount
    useEffect(() => {
        getVersion().then(v => {
            setCurrentAppVersion(v);
            // Auto-prune skipped versions that are now irrelevant
            pruneSkippedVersions(v);
        }).catch(console.error);
    }, []);

    const checkForUpdates = useCallback(async (isManual = false) => {
        if (!isManual && checkInProgress) return;
        if (!isManual && !acquireCheckLock()) return;

        try {
            const settings = getUpdateSettings();
            const target = settings.updateChannel || 'release';

            const update = await withRetry(() => check({ target }));
            updateLastCheck();
            saveUpdateSettings({ lastError: null });

            if (update) {
                // Check if user skipped this version
                if (!isManual && isVersionSkipped(update.version)) {
                    console.log(`Version ${update.version} was skipped by user`);
                    return;
                }

                const info = {
                    version: update.version,
                    body: update.body || t('updateChecker.title', 'New Update Available'),
                };

                setUpdateAvailable(info);
                setUpdateObj(update);

                lastCheckResult = {
                    available: true,
                    update: info,
                    error: null,
                };

                const currentSettings = getUpdateSettings();
                if (currentSettings.autoUpdate && !isManual) {
                    // Silently download and install in the background
                    downloadAndInstall(update, info, true);
                } else {
                    setUiState('prompt');
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const isReleaseJsonError = errorMsg.includes('Could not fetch a valid release JSON');
            const isDev = (import.meta as any).env?.DEV;
            
            if (isDev) {
                if (isReleaseJsonError) {
                    console.warn('Update check: Remote release JSON not configured or reachable (expected in development).');
                } else {
                    console.warn('Update check failed in dev mode:', err);
                }
            } else {
                console.error('Update check failed:', err);

                // Show toast for production errors (non-silent feedback)
                if (!isReleaseJsonError) {
                    const friendly = isSignatureError(errorMsg)
                        ? 'Update check failed: signature verification error.'
                        : `Update check failed: ${errorMsg}`;
                    saveUpdateSettings({ lastError: friendly });
                }
            }
        } finally {
            if (!isManual) releaseCheckLock();
        }
    }, [downloadAndInstall, t]);

    const handleSkipVersion = () => {
        if (updateAvailable) {
            skipVersion(updateAvailable.version);
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'skipped',
                previousVersion: currentAppVersion,
            });
            setUiState('hidden');
        }
    };

    const handleRelaunch = async () => {
        try {
            await relaunch();
        } catch (err) {
            console.error("Failed to relaunch:", err);
        }
    };

    const handleManualDownload = async () => {
        await openReleasesPage();
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

        const setupListeners = async () => {
            unlistenUpdate = await listen<UpdateInfo>('update-found', (event) => {
                setUpdateAvailable(event.payload);
                setUiState('prompt');
            });
        };

        setupListeners();

        return () => {
            if (unlistenUpdate) unlistenUpdate();
        };
    }, []);

    if (uiState === 'hidden') return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className={cn(
                "w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl shadow-sky-500/10 overflow-hidden",
                "animate-in zoom-in-95 duration-500 relative"
            )}>
                {/* Header Graphic Background */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-sky-500/20 to-transparent opacity-50 pointer-events-none"></div>

                <div className="p-8 relative">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-5">
                            <div className="relative">
                                <div className="absolute inset-0 bg-sky-500/20 rounded-2xl blur-lg animate-pulse"></div>
                                <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-sky-500/30 shadow-inner">
                                    {uiState === 'ready' ? (
                                        <Rocket className="w-8 h-8 text-sky-400" />
                                    ) : (
                                        <Download className="w-8 h-8 text-sky-400" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white tracking-tight">
                                    {uiState === 'ready' 
                                        ? t('updateChecker.readyTitle', 'Update Ready')
                                        : t('updateChecker.title', 'Software Update')}
                                </h3>
                                <div className="flex items-center gap-2 mt-1.5 opacity-80">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono text-slate-400">v{currentAppVersion}</span>
                                    <span className="text-slate-500">→</span>
                                    <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-400 font-medium">v{updateAvailable?.version}</span>
                                </div>
                            </div>
                        </div>
                        
                        {uiState !== 'downloading' && (
                            <button
                                onClick={() => setUiState('hidden')}
                                className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {uiState === 'ready' ? (
                        <div className="bg-slate-950/50 rounded-xl p-5 mb-8 border border-slate-800/80 shadow-inner text-center">
                            <p className="text-slate-300 leading-relaxed">
                                {t('updateChecker.readyDesc', 'The update has been downloaded and is ready to install. Restart the application to apply the changes.')}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-slate-950/50 rounded-xl p-5 mb-6 border border-slate-800/80 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">
                                {updateAvailable?.body}
                            </p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mb-6">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <span className="leading-relaxed">{error}</span>
                                {isSignatureMismatch && (
                                    <button
                                        onClick={handleManualDownload}
                                        className="flex items-center gap-1.5 mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-white transition-all text-xs font-semibold"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        {t('updateChecker.downloadManually', 'Download from GitHub Releases')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {uiState === 'downloading' && (
                        <div className="mb-8 space-y-3 bg-slate-950/30 p-5 rounded-xl border border-slate-800/50">
                            <div className="flex justify-between text-sm font-medium text-sky-200/80">
                                <span className="flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                                    {t('updateChecker.downloading', 'Downloading update...')}
                                </span>
                                <span className="text-sky-400 font-mono text-lg">{Math.round(downloadProgress)}%</span>
                            </div>
                            <div className="relative h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-700/50 shadow-inner">
                                <div
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(56,189,248,0.6)]"
                                    style={{ width: `${downloadProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        {uiState === 'ready' ? (
                            <button
                                onClick={handleRelaunch}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl",
                                    "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500",
                                    "text-white font-bold tracking-wider uppercase",
                                    "transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/20"
                                )}
                            >
                                <RefreshCw className="w-5 h-5" />
                                {t('updateChecker.relaunch', 'Restart Now')}
                            </button>
                        ) : isSignatureMismatch ? (
                            <button
                                onClick={handleManualDownload}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl",
                                    "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500",
                                    "text-white font-bold tracking-wider uppercase",
                                    "transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 border border-amber-400/20"
                                )}
                            >
                                <ExternalLink className="w-5 h-5" />
                                {t('updateChecker.openGitHub', 'Download from GitHub')}
                            </button>
                        ) : (
                            <button
                                onClick={() => downloadAndInstall()}
                                disabled={uiState === 'downloading'}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl",
                                    "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500",
                                    "text-white font-bold tracking-wider uppercase",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 border border-sky-400/20"
                                )}
                            >
                                {uiState === 'downloading' ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        {t('updateChecker.installing', 'Installing...')}
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" />
                                        {t('updateChecker.updateNow', 'Download & Install')}
                                    </>
                                )}
                            </button>
                        )}

                        {uiState !== 'downloading' && (
                            <button
                                onClick={() => setUiState('hidden')}
                                className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 hover:border-slate-600 font-bold uppercase tracking-wider"
                            >
                                {uiState === 'ready' ? t('updateChecker.later', 'Later') : t('updateChecker.later', 'Not Now')}
                            </button>
                        )}
                        
                        {uiState === 'prompt' && !isSignatureMismatch && (
                            <button
                                onClick={handleSkipVersion}
                                title={t('updateChecker.skip', 'Skip this version')}
                                className="px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700 hover:border-slate-600"
                            >
                                <Clock className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
