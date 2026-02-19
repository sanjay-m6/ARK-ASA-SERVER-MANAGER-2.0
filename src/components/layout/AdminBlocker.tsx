import { Shield, AlertTriangle, XCircle } from 'lucide-react';
import { exit } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';

import { useTranslation } from 'react-i18next';

export default function AdminBlocker() {
    const { t } = useTranslation();
    const handleGrantAccess = async () => {
        try {
            await invoke('request_admin_privileges');
        } catch (e) {
            console.error("Failed to request admin:", e);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0f] text-white overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-600/20 rounded-full blur-[120px] animate-pulse delay-1000" />
            </div>

            <div className="relative z-10 p-8 max-w-md w-full mx-4">
                <div className="glass-panel p-8 rounded-3xl border border-red-500/30 bg-black/40 backdrop-blur-xl shadow-2xl shadow-red-900/20 flex flex-col items-center text-center space-y-6">

                    <div className="relative">
                        <div className="absolute inset-0 bg-red-500 blur-2xl opacity-20 rounded-full"></div>
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30 relative z-10">
                            <Shield className="w-12 h-12 text-white" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-[#0a0a0f] rounded-full p-1.5 border border-red-500/50 z-20">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            {t('adminBlocker.title')}
                        </h1>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {t('adminBlocker.description')}
                        </p>
                    </div>

                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-left w-full space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <p className="text-sm text-red-100/90">
                                <span className="font-semibold text-white">{t('adminBlocker.missing')}</span>
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <p className="text-sm text-red-100/90">
                                {t('adminBlocker.reason')}
                            </p>
                        </div>
                    </div>

                    <div className="w-full pt-4 space-y-3">
                        <p className="text-xs text-slate-500">
                            {t('adminBlocker.prompt')}
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleGrantAccess}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 border border-emerald-500/30 rounded-xl text-white font-bold text-sm transition-all hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2 group"
                            >
                                <Shield className="w-4 h-4" />
                                {t('adminBlocker.grant')}
                            </button>

                            <button
                                onClick={() => exit()}
                                className="flex-1 py-3 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-red-500/50 rounded-xl text-slate-300 hover:text-red-400 font-medium text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                            >
                                <XCircle className="w-4 h-4 transition-colors" />
                                {t('adminBlocker.quit')}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
