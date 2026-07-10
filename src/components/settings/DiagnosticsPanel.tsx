import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Download, RefreshCw, AlertTriangle } from 'lucide-react';

interface DiagnosticResult {
    steamcmd_installed: boolean;
    internet_connected: boolean;
    disk_space_ok: boolean;
    memory_ok: boolean;
    issues: string[];
}

export default function DiagnosticsPanel() {
    const { t } = useTranslation();
    const [result, setResult] = useState<DiagnosticResult | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);
    const [steamcmdDir, setSteamcmdDir] = useState<string>('');

    const fetchSteamcmdDir = async () => {
        try {
            const dir = await invoke<string>('get_steamcmd_dir');
            setSteamcmdDir(dir);
        } catch (e) {
            console.error('Failed to get SteamCMD dir:', e);
        }
    };

    useEffect(() => {
        fetchSteamcmdDir();
    }, []);

    const runDiagnostics = async () => {
        const toastId = toast.loading(t('settings.diagnostics.running'));
        try {
            await fetchSteamcmdDir();
            const res = await invoke<DiagnosticResult>('run_diagnostics');
            setResult(res);

            // Add non-ascii path issue to report if detected
            if (steamcmdDir && /[^\x00-\x7F]/.test(steamcmdDir)) {
                if (!res.issues.some(i => i.includes('non-ASCII') || i.includes('non-English'))) {
                    res.issues.push(`SteamCMD installation path contains non-ASCII characters: "${steamcmdDir}". This causes SteamCMD to crash.`);
                }
            }

            if (res.issues.length === 0) {
                toast.success(t('settings.diagnostics.healthy'), { id: toastId });
            } else {
                toast.error(t('settings.diagnostics.issuesFound', { count: res.issues.length }), { id: toastId });
            }

            // Show dialog for detailed report
            const report = res.issues.length === 0
                ? t('settings.diagnostics.reportHealthy')
                : t('settings.diagnostics.reportIssues', { issues: res.issues.map((i: string) => `• ${i}`).join('\n') });

            await invoke('plugin:dialog|message', {
                title: t('settings.diagnostics.reportTitle'),
                message: report,
                kind: res.issues.length === 0 ? 'info' : 'warning'
            });

        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(t('settings.diagnostics.failed', { error: msg }), { id: toastId });
        }
    };

    const installSteamCmd = async () => {
        if (!result || result.steamcmd_installed) return;

        setIsInstalling(true);
        const toastId = toast.loading(t('settings.diagnostics.installSteamCmd'));

        try {
            await invoke('install_steamcmd');
            toast.success(t('settings.diagnostics.installSuccess'), { id: toastId });
            // Re-run diagnostics to confirm
            runDiagnostics();
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(t('settings.diagnostics.installFailed', { error: msg }), { id: toastId });
        } finally {
            setIsInstalling(false);
        }
    };

    return (
        <div className="space-y-4">
            <button
                onClick={runDiagnostics}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 font-bold text-lg flex items-center justify-center gap-2"
            >
                <CheckCircle className="w-6 h-6" />
                {t('settings.diagnostics.runCheck')}
            </button>

            {steamcmdDir && /[^\x00-\x7F]/.test(steamcmdDir) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-red-400">{t('settings.diagnostics.nonAsciiPath', 'SteamCMD Path Error')}</h4>
                            <p className="text-xs text-red-200/70 mt-1">
                                {t('settings.diagnostics.nonAsciiPathDesc', 'Your current SteamCMD path contains non-ASCII/non-English characters: "{{path}}". SteamCMD cannot operate from this location. Please set an ASCII-only custom SteamCMD path in Settings.', { path: steamcmdDir })}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Fix Actions */}
            {result && !result.steamcmd_installed && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-amber-400">{t('settings.diagnostics.steamCmdMissing')}</h4>
                                <p className="text-xs text-amber-200/70">{t('settings.diagnostics.steamCmdRequired')}</p>
                            </div>
                        </div>
                        <button
                            onClick={installSteamCmd}
                            disabled={isInstalling}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                        >
                            {isInstalling ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            {isInstalling ? t('settings.diagnostics.installing') : t('settings.diagnostics.installNow')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
