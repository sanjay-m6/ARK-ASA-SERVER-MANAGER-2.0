import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { CheckCircle, Download, RefreshCw, AlertTriangle } from 'lucide-react';

interface DiagnosticResult {
    steamcmd_installed: boolean;
    internet_connected: boolean;
    disk_space_ok: boolean;
    memory_ok: boolean;
    issues: string[];
}

export default function DiagnosticsPanel() {
    const [result, setResult] = useState<DiagnosticResult | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);

    const runDiagnostics = async () => {
        const toastId = toast.loading('Running diagnostics...');
        try {
            const res = await invoke<DiagnosticResult>('run_diagnostics');
            setResult(res);

            if (res.issues.length === 0) {
                toast.success('System Healthy! All checks passed.', { id: toastId });
            } else {
                toast.error(`Found ${res.issues.length} issues.`, { id: toastId });
            }

            // Show dialog for detailed report
            const report = res.issues.length === 0
                ? "✅ All Systems Go!\n\n• SteamCMD: Installed\n• Internet: Connected\n• Memory: OK\n• Disk Space: OK"
                : `⚠️ Issues Found:\n\n${res.issues.map((i: string) => `• ${i}`).join('\n')}`;

            await invoke('plugin:dialog|message', {
                title: 'Diagnostic Report',
                message: report,
                kind: res.issues.length === 0 ? 'info' : 'warning'
            });

        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(`Diagnostics failed: ${msg}`, { id: toastId });
        }
    };

    const installSteamCmd = async () => {
        if (!result || result.steamcmd_installed) return;

        setIsInstalling(true);
        const toastId = toast.loading('Downloading and installing SteamCMD...');

        try {
            await invoke('install_steamcmd');
            toast.success('SteamCMD installed successfully!', { id: toastId });
            // Re-run diagnostics to confirm
            runDiagnostics();
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(`Installation failed: ${msg}`, { id: toastId });
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
                Run System Check
            </button>

            {/* Quick Fix Actions */}
            {result && !result.steamcmd_installed && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-amber-400">SteamCMD Missing</h4>
                                <p className="text-xs text-amber-200/70">Required to download server files.</p>
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
                            {isInstalling ? 'Installing...' : 'Install Now'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
