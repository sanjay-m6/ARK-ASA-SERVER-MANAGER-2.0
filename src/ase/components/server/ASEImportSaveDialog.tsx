import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Save, Loader2, CheckCircle, AlertCircle, FileUp, Info } from 'lucide-react';
import type { AseServer } from '../../types/ase.types';
import { selectFolder, selectFile } from '../../../utils/tauri';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface Props {
    onClose: () => void;
    servers: AseServer[];
}

export default function ASEImportSaveDialog({ onClose, servers }: Props) {
    const { t } = useTranslation();
    const [selectedServerId, setSelectedServerId] = useState<number | string>('');
    const [sourcePath, setSourcePath] = useState('');
    const [importType, setImportType] = useState<'file' | 'folder'>('file');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelectFile = async () => {
        try {
            const path = await selectFile(t('dialogs.importSave.selectFile', 'Select Save File'), ['ark']);
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
            const folder = await selectFolder(t('dialogs.importSave.selectFolder', 'Select Save Folder'));
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
            setError(t('dialogs.importSave.validationError', 'Please select a target server and a source file or folder.'));
            return;
        }

        setIsImporting(true);
        setError(null);

        try {
            await invoke('import_ase_save', {
                serverId: Number(selectedServerId),
                sourcePath,
                importType,
            });
            toast.success(t('dialogs.importSave.success', 'Save data imported successfully!'));
            onClose();
        } catch (err) {
            setError(String(err));
            toast.error(t('dialogs.importSave.error', 'Failed to import save data'));
        } finally {
            setIsImporting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4"
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
                            <h2 className="text-xl font-bold text-white">{t('dialogs.importSave.title', 'Import Save Data')}</h2>
                            <p className="text-sm text-slate-400">{t('dialogs.importSave.aseSubtitle', 'Import save data into an ASE server')}</p>
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
                            {t('dialogs.importSave.targetLabel', 'Target Server')}
                        </label>
                        <select
                            value={selectedServerId}
                            onChange={(e) => setSelectedServerId(e.target.value)}
                            disabled={isImporting}
                            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 appearance-none cursor-pointer"
                        >
                            <option value="" className="bg-slate-900 text-slate-400">
                                {t('dialogs.importSave.selectServer', 'Select a server...')}
                            </option>
                            {servers.map((srv) => (
                                <option key={srv.id} value={srv.id} className="bg-slate-900 text-white">
                                    {srv.name} ({srv.mapName})
                                </option>
                            ))}
                        </select>
                        {servers.length === 0 && (
                            <p className="text-xs text-red-400 mt-2">{t('dialogs.importSave.noServers', 'No ASE servers found. Deploy or import a server first.')}</p>
                        )}
                    </div>

                    {/* Source Selection */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 mb-2 block">
                            {t('dialogs.importSave.sourceLabel', 'Source Save Data')}
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
                                    <span>{t('dialogs.importSave.selectFile', 'Select File')}</span>
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
                                    <span>{t('dialogs.importSave.selectFolder', 'Select Folder')}</span>
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
                            <p className="font-medium mb-1">{t('dialogs.importSave.importantNote', 'Important')}</p>
                            <p className="mb-2">{t('dialogs.importSave.backupWarning', 'A backup of existing save data will be created automatically before importing.')}</p>
                            <ul className="list-disc list-inside text-xs space-y-0.5 opacity-80">
                                <li><strong>File:</strong> Imports a single .ark save file</li>
                                <li><strong>Folder:</strong> Imports all save files from the selected folder</li>
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
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !sourcePath || !selectedServerId}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t('dialogs.importServer.importing', 'Importing...')}
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                {t('dialogs.importSave.startImport', 'Import Save')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
