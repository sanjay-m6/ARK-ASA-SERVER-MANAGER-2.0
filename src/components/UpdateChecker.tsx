import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
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

// Export function for manual trigger from Settings
export async function manualCheckForUpdates(): Promise<UpdateCheckResult> {
    if (checkInProgress) {
        return lastCheckResult;
    }
    
    checkInProgress = true;
    
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
            error: 'Failed to check for updates',
        };
    } finally {
        checkInProgress = false;
    }
    
    return lastCheckResult;
}

// Get current app version
export function getCurrentVersion(): string {
    // This will be set by Tauri
    return (window as any).__TAURI_INTERNALS__?.metadata?.appVersion || '2.1.4';
}

export default function UpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
    const [updateObj, setUpdateObj] = useState<Awaited<ReturnType<typeof check>> | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [showBanner, setShowBanner] = useState(false);

    const checkForUpdates = useCallback(async () => {
        if (checkInProgress) return;
        
        try {
            checkInProgress = true;
            const update = await check();
            updateLastCheck();
            
            if (update) {
                // Check if user skipped this version
                if (isVersionSkipped(update.version)) {
                    console.log(`Version ${update.version} was skipped by user`);
                    return;
                }
                
                setUpdateAvailable({
                    version: update.version,
                    body: update.body || 'New version available!',
                });
                setUpdateObj(update);
                setShowBanner(true);
                
                lastCheckResult = {
                    available: true,
                    update: {
                        version: update.version,
                        body: update.body || 'New version available!',
                    },
                    error: null,
                };
            }
        } catch (err) {
            console.error('Update check failed:', err);
        } finally {
            checkInProgress = false;
        }
    }, []);

    const handleSkipVersion = () => {
        if (updateAvailable) {
            skipVersion(updateAvailable.version);
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'skipped',
                previousVersion: getCurrentVersion(),
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
                if (event.event === 'Started' && event.data.contentLength) {
                    totalSize = event.data.contentLength;
                }
                if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;
                    const progress = totalSize > 0 
                        ? (downloaded / totalSize) * 100 
                        : Math.min((downloaded / 50000000) * 100, 99);
                    setDownloadProgress(progress);
                }
            });
            
            // Log successful update
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'installed',
                previousVersion: getCurrentVersion(),
            });
            
            await relaunch();
        } catch (err) {
            console.error('Update failed:', err);
            setError('Failed to download update');
            
            // Log failed update
            addUpdateHistory({
                version: updateAvailable.version,
                action: 'failed',
                previousVersion: getCurrentVersion(),
            });
            
            setIsDownloading(false);
        }
    };

    // Initial check after 5 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            if (shouldCheckForUpdates()) {
                checkForUpdates();
            }
        }, 5000);
        
        return () => clearTimeout(timer);
    }, [checkForUpdates]);

    // Scheduled interval checks
    useEffect(() => {
        const intervalMs = getCheckIntervalMs();
        
        if (!intervalMs) {
            return; // Interval is 'never'
        }
        
        const intervalId = setInterval(() => {
            if (shouldCheckForUpdates()) {
                checkForUpdates();
            }
        }, Math.min(intervalMs, 3600000)); // Check at most every hour
        
        return () => clearInterval(intervalId);
    }, [checkForUpdates]);

    if (!showBanner || !updateAvailable) return null;

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 max-w-sm",
            "bg-gradient-to-br from-slate-900 to-slate-800",
            "border border-sky-500/30 rounded-xl shadow-2xl shadow-sky-500/10"
        )}>
            <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-sky-500/20">
                            <Download className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Update Available</h3>
                            <p className="text-sm text-slate-400">Version {updateAvailable.version}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowBanner(false)}
                        className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                <p className="text-sm text-slate-300 mb-4 line-clamp-3">
                    {updateAvailable.body}
                </p>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {isDownloading && (
                    <div className="mb-3">
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-300"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                            Downloading... {Math.round(downloadProgress)}%
                        </p>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={downloadAndInstall}
                        disabled={isDownloading}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                            "bg-gradient-to-r from-sky-500 to-cyan-500",
                            "text-white font-medium text-sm",
                            "hover:from-sky-600 hover:to-cyan-600",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-all duration-200"
                        )}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Installing...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                Update Now
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleSkipVersion}
                        disabled={isDownloading}
                        title="Skip this version"
                        className={cn(
                            "px-3 py-2 rounded-lg",
                            "bg-slate-700 text-slate-300",
                            "hover:bg-slate-600",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-colors"
                        )}
                    >
                        <Clock className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowBanner(false)}
                        disabled={isDownloading}
                        className={cn(
                            "px-4 py-2 rounded-lg",
                            "bg-slate-700 text-slate-300 font-medium text-sm",
                            "hover:bg-slate-600",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-colors"
                        )}
                    >
                        Later
                    </button>
                </div>
            </div>
        </div>
    );
}
