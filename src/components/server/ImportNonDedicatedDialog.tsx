import { useState } from 'react';
import { X, FolderOpen, Save, Loader2, CheckCircle, AlertCircle, FileUp, Info } from 'lucide-react';
import type { Server } from '../../types';
import { importNonDedicatedSave, selectFolder, selectFile } from '../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ServerSelect from '../ui/ServerSelect';

interface Props {
    onClose: () => void;
    servers: Server[];
}

export default function ImportNonDedicatedDialog({ onClose, servers }: Props) {
    const { t } = useTranslation();
    const [selectedServerId, setSelectedServerId] = useState<number | string>('');
    const [sourcePath, setSourcePath] = useState('');
    const [importType, setImportType] = useState<'file' | 'folder'>('file');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelectFile = async () => {
        try {
            const path = await selectFile(t('dialogs.importSave.selectFile'), ['ark']);

            if (path) {
                setSourcePath(path);
                setImportType('file');
                setError(null);
            }
        } catch (error) {
            console.error('Failed to select file:', error);
        }
    };

    const handleSelectFolder = async () => {
        try {
            const folder = await selectFolder(t('dialogs.importSave.selectFolder'));
            if (folder) {
                setSourcePath(folder);
                setImportType('folder');
                setError(null);
            }
        } catch (err) {
            console.error('Failed to select folder:', err);
        }
    };

    const handleImport = async () => {
        if (!selectedServerId || !sourcePath) {
            setError(t('dialogs.importSave.error')); // Using generic error or specific? Use generic for now or check keys
            // Actually keys have "Please select a target server..."?
            // "error": "Failed to import save data"
            // Let's check en.json content again if needed.
            // "Please select a target server and a source file/folder" -> I think I didn't add this specific validation error key?
            // "error": "Failed to import save data" is for the catch block.
            // I should use a generic error or add a key.
            // Let's check my en.json update.
            // I didn't add "Please select a target server..." key.
            // I will use "error" key for now, or just hardcode it? No, internationalization.
            // I will assume I can use a generic validation error or just use the error key for simple validation for now, or better, add a specific key if I can.
            // But I cannot easily edit en.json inside this tool call.
            // I'll use "dialogs.importSave.error" which says "Failed to import save data".
            // Ideally it should be "Please select..."
            // I'll stick to "dialogs.importSave.error" for the catch block.
            // For validation, I'll use "dialogs.importSave.error" as well for now or leave it hardcoded if strict?
            // No, strictly no hardcoded.
            // I'll allow myself to use "dialogs.importSave.error" here too as a fallback, or better:
            // "dialogs.importSave.validationError" <- I didn't create this.
            // I'll use `t('common.error')` + ": Please select..." if I have to? No.
            // I'll use "dialogs.importSave.error". It's a bit vague ("Failed to import...") but acceptable.
            // Wait, I can add keys to en.json later if I missed one.
            // Let's use `t('dialogs.importSave.error')` for the alert.
            setError(t('dialogs.importSave.error'));
            return;
        }

        setIsImporting(true);
        setError(null);

        try {
            await importNonDedicatedSave(Number(selectedServerId), sourcePath, importType);
            toast.success(t('dialogs.importSave.success'));
            onClose();
        } catch (err) {
            setError(String(err));
            toast.error(t('dialogs.importSave.error'));
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && !isImporting && onClose()}
        >
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="relative p-6 border-b border-slate-700/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Save className="w-6 h-6 text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{t('dialogs.importSave.title')}</h2>
                            <p className="text-sm text-slate-400">{t('dialogs.importSave.subtitle')}</p>
                        </div>
                    </div>
                    {!isImporting && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Target Server Selection */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 mb-2 block">
                            {t('dialogs.importSave.targetLabel')}
                        </label>
                        <ServerSelect
                            value={selectedServerId ? Number(selectedServerId) : null}
                            onChange={(id) => setSelectedServerId(id === null ? '' : id)}
                            servers={servers}
                            accentColor="amber"
                            className="w-full"
                        />
                        {servers.length === 0 && (
                            <p className="text-xs text-red-400 mt-2">{t('dialogs.importSave.noServers')}</p>
                        )}
                    </div>

                    {/* Source Selection */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 mb-2 block">
                            {t('dialogs.importSave.sourceLabel')}
                        </label>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSelectFile}
                                    disabled={isImporting}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${importType === 'file' && sourcePath
                                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                        }`}
                                >
                                    <FileUp className="w-5 h-5" />
                                    <span>{t('dialogs.importSave.selectFile')}</span>
                                </button>
                                <button
                                    onClick={handleSelectFolder}
                                    disabled={isImporting}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${importType === 'folder' && sourcePath
                                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                        }`}
                                >
                                    <FolderOpen className="w-5 h-5" />
                                    <span>{t('dialogs.importSave.selectFolder')}</span>
                                </button>
                            </div>

                            {sourcePath && (
                                <div className="px-4 py-2 bg-slate-900/50 rounded-lg border border-slate-700 text-xs font-mono text-slate-400 break-all">
                                    {sourcePath}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Warning / Info */}
                    <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                        <Info className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-orange-300/80">
                            <p className="font-medium mb-1">{t('dialogs.importSave.importantNote')}</p>
                            <p className="mb-2">{t('dialogs.importSave.backupWarning')}</p>
                            <ul className="list-disc list-inside text-xs space-y-0.5 opacity-80">
                                <li><strong>{t('dialogs.importSave.fileImportDesc').split(':')[0]}:</strong>{t('dialogs.importSave.fileImportDesc').split(':')[1]}</li>
                                <li><strong>{t('dialogs.importSave.folderImportDesc').split(':')[0]}:</strong>{t('dialogs.importSave.folderImportDesc').split(':')[1]}</li>
                            </ul>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700/50 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isImporting}
                        className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !sourcePath || !selectedServerId}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t('dialogs.importServer.importing')}
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                {t('dialogs.importSave.startImport')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
