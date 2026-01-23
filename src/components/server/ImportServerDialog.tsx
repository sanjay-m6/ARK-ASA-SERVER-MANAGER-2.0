import { useState } from 'react';
import { X, FolderOpen, Server, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { importServer, selectFolder } from '../../utils/tauri';
import toast from 'react-hot-toast';

interface Props {
    onClose: () => void;
}

export default function ImportServerDialog({ onClose }: Props) {
    const { addServer } = useServerStore();
    const [installPath, setInstallPath] = useState('');
    const [serverName, setServerName] = useState('Imported Server');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelectFolder = async () => {
        try {
            const folder = await selectFolder('Select existing ARK server folder');
            if (folder) {
                setInstallPath(folder);
                setError(null);
                // Try to extract name from folder path
                const folderName = folder.split('\\').pop() || folder.split('/').pop();
                if (folderName) {
                    setServerName(folderName);
                }
            }
        } catch (err) {
            console.error('Failed to select folder:', err);
        }
    };

    const handleImport = async () => {
        if (!installPath || !serverName) {
            setError('Please select a folder and provide a name');
            return;
        }

        setIsImporting(true);
        setError(null);

        try {
            const server = await importServer(installPath, serverName);
            addServer(server);
            toast.success(`Server "${server.name}" imported successfully!`);
            onClose();
        } catch (err) {
            setError(String(err));
            toast.error('Failed to import server');
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
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <FolderOpen className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Import Existing Server</h2>
                            <p className="text-sm text-slate-400">Add an existing ARK installation</p>
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
                <div className="p-6 space-y-5">
                    {/* Folder Selection */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                            <FolderOpen className="w-4 h-4" />
                            Server Installation Folder
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={installPath}
                                onChange={(e) => setInstallPath(e.target.value)}
                                placeholder="C:\ARKServers\MyServer"
                                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                disabled={isImporting}
                            />
                            <button
                                onClick={handleSelectFolder}
                                disabled={isImporting}
                                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl transition-colors"
                            >
                                <FolderOpen className="w-5 h-5 text-white" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Select the folder containing ShooterGame/Binaries/Win64/ArkAscendedServer.exe
                        </p>
                    </div>

                    {/* Server Name */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                            <Server className="w-4 h-4" />
                            Server Name
                        </label>
                        <input
                            type="text"
                            value={serverName}
                            onChange={(e) => setServerName(e.target.value)}
                            placeholder="My Server"
                            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            disabled={isImporting}
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Settings will be auto-detected from GameUserSettings.ini
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {/* Info Box */}
                    <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-300/80">
                            <p className="font-medium mb-1">What gets imported:</p>
                            <ul className="list-disc list-inside text-xs space-y-0.5 opacity-80">
                                <li>Session name & max players</li>
                                <li>Port configuration</li>
                                <li>Admin password</li>
                                <li>RCON settings</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700/50 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isImporting}
                        className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !installPath || !serverName}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                Import Server
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
