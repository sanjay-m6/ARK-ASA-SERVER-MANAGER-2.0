import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Key, Lock, Eye, EyeOff, ExternalLink, Save, X, CheckCircle, AlertCircle, Loader2, Info } from 'lucide-react';
import { getSetting, setSetting } from '../../utils/tauri';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

interface CurseForgeKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export default function CurseForgeKeyModal({ isOpen, onClose, onSaved }: CurseForgeKeyModalProps) {
    const { t } = useTranslation();
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            getSetting('curseforge_api_key')
                .then((key) => {
                    setApiKey(key || '');
                    setKeyStatus('idle');
                })
                .catch((err) => {
                    console.error('Failed to load CurseForge key:', err);
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleVerify = async () => {
        if (!apiKey.trim()) {
            toast.error(t('settings.curseforgeKey.enterKeyFirst', 'Please enter an API Key first'));
            return;
        }
        setIsVerifying(true);
        try {
            const isValid = await invoke<boolean>('verify_curseforge_key', { apiKey: apiKey.trim() });
            if (isValid) {
                setKeyStatus('valid');
                toast.success(t('settings.keyVerified', 'CurseForge API Key verified successfully!'));
            } else {
                setKeyStatus('invalid');
                toast.error(t('settings.invalidKey', 'Invalid CurseForge API Key'));
            }
        } catch (error) {
            console.error('Verification failed:', error);
            setKeyStatus('invalid');
            toast.error(t('settings.verificationFailed', 'Failed to verify CurseForge API Key'));
        } finally {
            setIsVerifying(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setSetting('curseforge_api_key', apiKey.trim());
            toast.success(t('settings.curseforgeKeySaved', 'CurseForge API Key saved successfully!'));
            if (onSaved) {
                onSaved();
            }
            onClose();
        } catch (error) {
            console.error('Failed to save CurseForge key:', error);
            toast.error(t('settings.saveFailed', 'Failed to save CurseForge API Key'));
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl flex flex-col bg-slate-900/95 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-200 ring-1 ring-amber-500/20">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/60">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/30">
                            <Key className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {t('settings.curseforgeModalTitle', 'CurseForge API Key Settings')}
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {t('settings.curseforgeModalSubtitle', 'Configure API key for live mod search and server updates')}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                    {isLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-semibold text-slate-200 mb-2">
                                    {t('settings.curseforgeKeyLabel', 'CurseForge API Key')}
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => {
                                            setApiKey(e.target.value);
                                            setKeyStatus('idle');
                                        }}
                                        placeholder={t('settings.curseforgeKeyPlaceholder', 'Enter your CurseForge API key')}
                                        className="w-full pl-12 pr-28 py-3.5 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono text-sm"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(!showKey)}
                                            className="p-1.5 text-slate-400 hover:text-white transition-colors"
                                        >
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleVerify}
                                            disabled={isVerifying || !apiKey.trim()}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                            <span>{t('settings.verify', 'Verify')}</span>
                                        </button>
                                    </div>
                                </div>

                                {keyStatus === 'valid' && (
                                    <div className="mt-2.5 flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>{t('settings.keyValidMessage', 'Key verified and active!')}</span>
                                    </div>
                                )}

                                {keyStatus === 'invalid' && (
                                    <div className="mt-2.5 flex items-center gap-1.5 text-red-400 text-xs font-medium">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>{t('settings.keyInvalidMessage', 'Key verification failed. Please check your key.')}</span>
                                    </div>
                                )}
                            </div>

                            {/* Help & External Link Banner */}
                            <div className="p-4 bg-slate-800/50 border border-amber-500/20 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-200 text-xs font-semibold">
                                        <Info className="w-4 h-4 text-amber-400" />
                                        <span>{t('settings.needCurseforgeKey', 'Don\'t have an API Key?')}</span>
                                    </div>
                                    <a
                                        href="https://console.curseforge.com/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline"
                                    >
                                        <span>console.curseforge.com</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {t('settings.curseforgeModalHelp', 'CurseForge requires a free API key to search mods and enable automated mod updates on server startup. Sign in to CurseForge Console to generate a key.')}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal Footer with POP Save Button */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800 bg-slate-900/80">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>

                    {/* Pop Save Settings Button */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className={cn(
                            "flex items-center space-x-2.5 px-7 py-3 rounded-2xl font-bold text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                            "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/30 border border-sky-400/30"
                        )}
                    >
                        <Save className={cn("w-4.5 h-4.5", isSaving && "animate-spin")} />
                        <span>{isSaving ? t('common.saving', 'Saving…') : t('common.saveSettings', 'Save Settings')}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
