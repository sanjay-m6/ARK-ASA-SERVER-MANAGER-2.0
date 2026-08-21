import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { emit, listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { Download, X, RefreshCw, AlertCircle, Clock, Rocket, ExternalLink, Archive } from 'lucide-react';
import { cn } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useAseServerStore } from '../ase/stores/aseServerStore';
import { getSetting } from '../utils/tauri';
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

// Detect elevation / permission errors
function isElevationError(errorMsg: string): boolean {
    return errorMsg.includes('Access is denied') ||
           errorMsg.includes('Permission denied') ||
           errorMsg.includes('elevation') ||
           errorMsg.includes('requires administrator') ||
           errorMsg.includes('0x80070005');
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

// Build the direct download URL for the latest release installer
function getInstallerDownloadUrl(version: string): string {
    const tag = version.startsWith('v') ? version : `v${version}`;
    return `https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/download/${tag}/ASA.Server.Manager_${version}_x64-setup.exe`;
}

// Build the portable ZIP download URL
function getPortableDownloadUrl(version: string): string {
    const tag = version.startsWith('v') ? version : `v${version}`;
    return `https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/download/${tag}/ASA-Server-Manager-Portable.zip`;
}

// Open a URL in the user's browser
async function openUrl(url: string) {
    try {
        await invoke('plugin:opener|open_url', { url });
    } catch {
        window.open(url, '_blank');
    }
}

// Open the releases page for manual download
async function openReleasesPage() {
    await openUrl(getReleasesUrl());
}

// Export function for manual trigger from Settings
export async function manualCheckForUpdates(): Promise<UpdateCheckResult> {
    if (!acquireCheckLock()) {
        return lastCheckResult;
    }

    try {
        const update = await withRetry(() => check({ timeout: 30000 }));
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
    const [isElevationIssue, setIsElevationIssue] = useState(false);
    
    const [settingsRevision, setSettingsRevision] = useState(0); // Used to trigger interval restart
    const [currentAppVersion, setCurrentAppVersion] = useState<string>('');

    // Refs to avoid stale closures — the core fix for "nothing happens"
    const updateObjRef = useRef(updateObj);
    const updateAvailableRef = useRef(updateAvailable);
    const currentAppVersionRef = useRef(currentAppVersion);

    useEffect(() => { updateObjRef.current = updateObj; }, [updateObj]);
    useEffect(() => { updateAvailableRef.current = updateAvailable; }, [updateAvailable]);
    useEffect(() => { currentAppVersionRef.current = currentAppVersion; }, [currentAppVersion]);

    // Notification helper to broadcast updates to active servers and Discord
    const notifyUsersOfUpdate = async (newVersion: string) => {
        try {
            console.log(`[UPDATER] Broadcasting update warning to all users for version v${newVersion}...`);
            
            // 1. Broadcast to ASA servers
            const asaServers = useServerStore.getState().servers;
            for (const s of asaServers) {
                if (s.status === 'online' || s.status === 'running') {
                    try {
                        await invoke('rcon_send_command', {
                            serverId: s.id,
                            command: `Broadcast "Server Manager is updating to v${newVersion}..."`
                        });
                    } catch (e) {
                        console.error(`Failed to send RCON update broadcast to ASA server #${s.id}:`, e);
                    }
                }
            }

            // 2. Broadcast to ASE servers
            const aseServers = useAseServerStore.getState().servers;
            const { sendAseRcon } = await import('../ase/utils/aseCommands');
            for (const s of aseServers) {
                if (s.status === 'online' || s.status === 'running') {
                    try {
                        await sendAseRcon(s.id, `Broadcast "Server Manager is updating to v${newVersion}..."`);
                    } catch (e) {
                        console.error(`Failed to send RCON update broadcast to ASE server #${s.id}:`, e);
                    }
                }
            }

            // 3. Post to Discord Webhooks
            const payload = {
                embeds: [
                    {
                        title: "⚙️ System Update Initiated",
                        description: `The Server Manager is downloading and installing update **v${newVersion}**.\nActive game servers will remain online, but manager controls will temporarily restart.`,
                        color: 5814783, // Cyan/Blue
                        footer: { text: "ASA Server Manager 2.0" },
                        timestamp: new Date().toISOString()
                    }
                ]
            };

            const globalWebhook = await getSetting('discord_webhook_url');
            if (globalWebhook && globalWebhook.startsWith('http')) {
                await fetch(globalWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(console.error);
            }

            const aseWebhook = await getSetting('ase_discord_webhook_url');
            if (aseWebhook && aseWebhook.startsWith('http') && aseWebhook !== globalWebhook) {
                await fetch(aseWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(console.error);
            }
        } catch (err) {
            console.error('[UPDATER] Failed to send update notifications:', err);
        }
    };

    const downloadAndInstall = useCallback(async (
        updater?: Awaited<ReturnType<typeof check>> | null, 
        info?: {version: string} | null, 
        silent: boolean = false
    ) => {
        // Use refs as fallback to prevent stale closure reads
        let resolvedUpdater = updater ?? updateObjRef.current;
        const resolvedInfo = info ?? updateAvailableRef.current;

        if (!resolvedInfo) return;

        if (!silent) {
            setUiState('downloading');
        }
        setError(null);
        setIsSignatureMismatch(false);
        setIsElevationIssue(false);
        setDownloadProgress(0);

        try {
            // If the updater object is not in state (e.g. we opened via event listener),
            // run check() to fetch the active update object from tauri-plugin-updater.
            if (!resolvedUpdater) {
                console.log('[UPDATER] Updater object is null, fetching active update object...');
                try {
                    const freshUpdate = await withRetry(() => check({ timeout: 30000 }), 2, 3000);
                    if (freshUpdate && freshUpdate.version === resolvedInfo.version) {
                        resolvedUpdater = freshUpdate;
                        setUpdateObj(freshUpdate);
                    } else {
                        console.warn('[UPDATER] Version mismatch on re-check. Expected:', resolvedInfo.version, 'Got:', freshUpdate?.version);
                        // Even if versions don't match exactly, use what we got
                        if (freshUpdate) {
                            resolvedUpdater = freshUpdate;
                            setUpdateObj(freshUpdate);
                        }
                    }
                } catch (refetchErr) {
                    console.error('[UPDATER] Failed to re-fetch updater object:', refetchErr);
                    // If re-fetch fails, offer direct download instead of dead-ending
                    setError(
                        t('updateChecker.refetchFailed', 
                          'Could not initialize the auto-updater. Please download the update manually.')
                    );
                    setUiState('prompt');
                    setIsSignatureMismatch(true); // triggers manual download button
                    return;
                }
            }

            if (!resolvedUpdater) {
                setError(t('updateChecker.noUpdater', 'Update check returned no data. Please try again or download manually.'));
                setUiState('prompt');
                setIsSignatureMismatch(true);
                return;
            }

            // Automatically notify active users/players before downloading
            await notifyUsersOfUpdate(resolvedInfo.version);

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
            const elevError = isElevationError(errorMsg);
            
            setIsSignatureMismatch(sigError);
            setIsElevationIssue(elevError);

            let friendlyMsg: string;
            if (sigError) {
                friendlyMsg = t('updateChecker.signatureError', 
                    'The update signature does not match. This usually means the update was signed with a different key. Please download the latest version manually from GitHub Releases.');
            } else if (elevError) {
                friendlyMsg = t('updateChecker.elevationError',
                    'The updater needs Administrator privileges to replace files. Please restart the app as Administrator, or download the update manually.');
            } else {
                friendlyMsg = `${t('updateChecker.error', 'Update failed')}: ${errorMsg}`;
            }

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
                if (sigError || elevError) {
                    toast.error(
                        sigError
                            ? t('updateChecker.signatureToast', 'Update failed: signature mismatch. Check Settings → Updates for details.')
                            : t('updateChecker.elevationToast', 'Update failed: administrator privileges required. Right-click the app → Run as Administrator.'),
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
            
            // Remember system: Check if the version has changed since the last run
            const lastRunVersion = localStorage.getItem('last_run_version');
            if (lastRunVersion && lastRunVersion !== v) {
                // Relaunched after successful update!
                toast.success(`Successfully updated to version v${v}!`, {
                    duration: 6000,
                    icon: '🚀'
                });
            }
            localStorage.setItem('last_run_version', v);

            // Auto-prune skipped versions that are now irrelevant
            pruneSkippedVersions(v);
        }).catch(console.error);
    }, []);

    const checkForUpdates = useCallback(async (isManual = false) => {
        if (!isManual && checkInProgress) return;
        if (!isManual && !acquireCheckLock()) return;

        try {
            const update = await withRetry(() => check({ timeout: 30000 }));
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
            toast.success(t('updateChecker.skippedToast', 'Version skipped. You can check for updates again in Settings.'));
        }
    };

    const handleRelaunch = async () => {
        try {
            // Small delay to ensure the NSIS installer process finishes file operations
            await new Promise(resolve => setTimeout(resolve, 1500));
            await relaunch();
        } catch (err) {
            console.error("Failed to relaunch:", err);
            toast.error(
                t('updateChecker.relaunchFailed', 'Failed to restart. Please close and reopen the application manually.'),
                { duration: 6000 }
            );
        }
    };

    const handleManualDownload = async () => {
        if (updateAvailable) {
            // Try to open the specific installer download first
            await openUrl(getInstallerDownloadUrl(updateAvailable.version));
        } else {
            await openReleasesPage();
        }
    };

    const handlePortableDownload = async () => {
        if (updateAvailable) {
            await openUrl(getPortableDownloadUrl(updateAvailable.version));
        } else {
            await openReleasesPage();
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

    // Listen for manual check events and TopBar banner trigger
    useEffect(() => {
        let unlistenUpdate: (() => void) | null = null;

        const setupListeners = async () => {
            unlistenUpdate = await listen<UpdateInfo>('update-found', (event) => {
                setUpdateAvailable(event.payload);
                setUiState('prompt');
            });
        };

        // Listen for TopBar's "Review & Update" click
        const handleShowBanner = () => {
            if (updateAvailableRef.current) {
                setUiState('prompt');
            }
        };
        window.addEventListener('show-update-banner', handleShowBanner);

        setupListeners();

        return () => {
            if (unlistenUpdate) unlistenUpdate();
            window.removeEventListener('show-update-banner', handleShowBanner);
        };
    }, []);

    if (uiState === 'hidden') return null;

    const showManualFallback = isSignatureMismatch || isElevationIssue;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className={cn(
                "w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-sky-500/10 overflow-hidden backdrop-blur-md",
                "animate-in zoom-in-95 duration-500 relative"
            )}>
                {/* Header Graphic Background */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-sky-500/10 to-transparent opacity-50 pointer-events-none"></div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                `}} />

                <div className="p-8 relative">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-5">
                            <div className="relative">
                                <div className="absolute inset-0 bg-sky-500/20 rounded-2xl blur-lg animate-pulse"></div>
                                <div className="relative p-3.5 rounded-2xl bg-[var(--surface-active)] border border-sky-500/30 shadow-inner">
                                    {uiState === 'ready' ? (
                                        <Rocket className="w-8 h-8 text-sky-400" />
                                    ) : (
                                        <Download className="w-8 h-8 text-sky-400" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                                    {uiState === 'ready' 
                                        ? t('updateChecker.readyTitle', 'Update Ready')
                                        : t('updateChecker.title', 'Update Available')}
                                </h3>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="px-2.5 py-0.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]">v{currentAppVersion}</span>
                                    <span className="text-[var(--text-muted)] text-xs">→</span>
                                    <span className="px-2.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono text-sky-400 font-medium">v{updateAvailable?.version}</span>
                                </div>
                            </div>
                        </div>
                        
                        {uiState !== 'downloading' && (
                            <button
                                onClick={() => setUiState('hidden')}
                                className="p-2 hover:bg-[var(--surface-hover)] rounded-xl transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {uiState === 'ready' ? (
                        <div className="bg-[var(--bg-primary)]/50 rounded-xl p-5 mb-8 border border-[var(--border)] shadow-inner text-center">
                            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                                {t('updateChecker.readyDesc', 'The update has been downloaded and is ready to install. Restart the application to apply the changes.')}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-[var(--bg-primary)]/50 rounded-xl p-5 mb-6 border border-[var(--border)] max-h-48 overflow-y-auto custom-scrollbar shadow-inner text-[var(--text-secondary)]">
                            <div className="text-xs leading-relaxed whitespace-pre-wrap font-mono prose prose-invert max-w-none">
                                {updateAvailable?.body}
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mb-6">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <span className="leading-relaxed">{error}</span>
                                {showManualFallback && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <button
                                            onClick={handleManualDownload}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-white transition-all text-xs font-semibold cursor-pointer"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t('updateChecker.downloadInstaller', 'Download Installer')}
                                        </button>
                                        <button
                                            onClick={handlePortableDownload}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-xs font-semibold cursor-pointer"
                                        >
                                            <Archive className="w-3.5 h-3.5" />
                                            {t('updateChecker.downloadPortable', 'Portable ZIP')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Progress Bar with Realtime Animation */}
                    {uiState === 'downloading' && (
                        <div className="mb-8 space-y-3 bg-[var(--bg-primary)]/30 p-5 rounded-xl border border-[var(--border)]">
                            <div className="flex justify-between text-xs font-medium text-sky-200/85">
                                <span className="flex items-center gap-2">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                                    {t('updateChecker.downloading', 'Downloading update files...')}
                                </span>
                                <span className="text-sky-400 font-mono text-base font-bold">{Math.round(downloadProgress)}%</span>
                            </div>
                            <div className="relative h-2.5 w-full bg-[var(--bg-primary)] rounded-full overflow-hidden border border-[var(--border)] shadow-inner">
                                <div
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(56,189,248,0.5)]"
                                    style={{ width: `${downloadProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.15)_50%,transparent_100%)] animate-[shimmer_1.5s_infinite] bg-[length:200%_100%]"></div>
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
                                    "text-white font-bold tracking-wider uppercase text-xs",
                                    "transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/20 cursor-pointer"
                                )}
                            >
                                <RefreshCw className="w-4 h-4" />
                                {t('updateChecker.relaunch', 'RESTART NOW')}
                            </button>
                        ) : showManualFallback ? (
                            <button
                                onClick={handleManualDownload}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl",
                                    "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500",
                                    "text-white font-bold tracking-wider uppercase text-xs",
                                    "transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 border border-amber-400/20 cursor-pointer"
                                )}
                            >
                                <ExternalLink className="w-4 h-4" />
                                {t('updateChecker.openGitHub', 'DOWNLOAD FROM GITHUB')}
                            </button>
                        ) : (
                            <button
                                onClick={() => downloadAndInstall()}
                                disabled={uiState === 'downloading'}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl",
                                    "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500",
                                    "text-white font-bold tracking-wider uppercase text-xs",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 border border-sky-400/20 cursor-pointer"
                                )}
                            >
                                {uiState === 'downloading' ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        {t('updateChecker.installing', 'INSTALLING...')}
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        {t('updateChecker.updateNow', 'UPDATE NOW')}
                                    </>
                                )}
                            </button>
                        )}

                        {uiState !== 'downloading' && (
                            <button
                                onClick={() => setUiState('hidden')}
                                className="px-6 py-3.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--border)] font-bold uppercase tracking-wider text-xs cursor-pointer"
                            >
                                {uiState === 'ready' ? t('updateChecker.later', 'LATER') : t('updateChecker.later', 'LATER')}
                            </button>
                        )}
                        
                        {uiState === 'prompt' && !showManualFallback && (
                            <button
                                onClick={handleSkipVersion}
                                title={t('updateChecker.skip', 'Skip this version')}
                                className="px-4 py-3.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all border border-[var(--border)] cursor-pointer"
                            >
                                <Clock className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
