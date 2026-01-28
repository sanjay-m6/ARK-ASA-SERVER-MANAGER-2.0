import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Folder,
    File,
    ChevronRight,
    ArrowUp,
    Save,
    RefreshCw,
    FileText,
    HardDrive,
    LayoutGrid,
    List as ListIcon,
    Search,
    ArrowLeft,
    ArrowRight,
    Monitor,
    Trash2,
    Edit2,
    Plus,
    ExternalLink,
    X
} from 'lucide-react';
import { cn } from '../utils/helpers';
import toast from 'react-hot-toast';

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
    last_modified: number;
}

interface DiskEntry {
    name: string;
    mount_point: string;
    total_space: number;
    available_space: number;
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
};

export default function FileManager() {
    const [currentPath, setCurrentPath] = useState<string>('C:/'); // Default start path
    const [history, setHistory] = useState<string[]>(['C:/']);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [files, setFiles] = useState<FileEntry[]>([]);
    const [drives, setDrives] = useState<DiskEntry[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Editor State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editorContent, setEditorContent] = useState('');
    const [editorFile, setEditorFile] = useState<FileEntry | null>(null);

    // Modal States
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const loadDrives = async () => {
        try {
            const disks = await invoke<DiskEntry[]>('get_disks');
            setDrives(disks);
        } catch (err) {
            console.error('Failed to load drives:', err);
        }
    };

    const loadDirectory = useCallback(async (path: string, addToHistory = true) => {
        try {
            setLoading(true);
            setError(null);

            // Normalize path slightly to avoid duplicate history entries if possible (though backend handles separators)
            const entries = await invoke<FileEntry[]>('read_directory', { path });
            setFiles(entries);
            setCurrentPath(path);
            setSelectedFile(null);

            if (addToHistory) {
                const newHistory = history.slice(0, historyIndex + 1);
                newHistory.push(path);
                setHistory(newHistory);
                setHistoryIndex(newHistory.length - 1);
            }
        } catch (err) {
            setError(String(err));
            toast.error(`Failed to load directory: ${err}`);
            // If path failed, maybe go back? For now just show error.
        } finally {
            setLoading(false);
        }
    }, [history, historyIndex]);

    useEffect(() => {
        loadDrives();
        loadDirectory('C:/', false); // Initial load
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleNavigate = (path: string) => {
        if (path === currentPath) return;
        loadDirectory(path);
    };

    const handleBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            loadDirectory(history[newIndex], false);
        }
    };

    const handleForward = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            loadDirectory(history[newIndex], false);
        }
    };

    const handleUp = async () => {
        try {
            const parent = await invoke<string>('get_parent_directory', { path: currentPath });
            if (parent !== currentPath) {
                handleNavigate(parent);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const openFile = async (file: FileEntry) => {
        if (file.is_dir) {
            handleNavigate(file.path);
        } else {
            // Try to read content
            try {
                setLoading(true);
                const content = await invoke<string>('read_file_content', { path: file.path });
                setEditorContent(content);
                setEditorFile(file);
                setIsEditorOpen(true);
            } catch (err) {
                toast.error(`Failed to read file: ${err}`);
            } finally {
                setLoading(false);
            }
        }
    };

    const saveFile = async () => {
        if (!editorFile) return;
        try {
            setSaving(true);
            await invoke('write_file_content', {
                path: editorFile.path,
                content: editorContent
            });
            toast.success('File saved successfully');
        } catch (err) {
            toast.error(`Failed to save file: ${err}`);
        } finally {
            setSaving(false);
        }
    };

    const createFolder = async () => {
        if (!newFolderName) return;
        try {
            // Very basic path join
            const separator = currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : '/';
            const path = `${currentPath}${separator}${newFolderName}`;

            await invoke('create_directory', { path });
            toast.success('Folder created');
            setIsCreateFolderOpen(false);
            setNewFolderName('');
            loadDirectory(currentPath, false); // Refresh
        } catch (err) {
            toast.error(`Failed to create folder: ${err}`);
        }
    };

    const renameItem = async () => {
        if (!selectedFile || !newName) return;
        try {
            const parent = await invoke<string>('get_parent_directory', { path: selectedFile.path });
            const separator = parent.endsWith('/') || parent.endsWith('\\') ? '' : '/';
            const newPath = `${parent}${separator}${newName}`;

            await invoke('rename_item', { oldPath: selectedFile.path, newPath });
            toast.success('Item renamed');
            setIsRenameOpen(false);
            setNewName('');
            loadDirectory(currentPath, false);
        } catch (err) {
            toast.error(`Failed to rename: ${err}`);
        }
    };

    const deleteItem = async () => {
        if (!selectedFile) return;
        if (!confirm(`Are you sure you want to delete "${selectedFile.name}"? This cannot be undone.`)) return;

        try {
            await invoke('delete_item', { path: selectedFile.path });
            toast.success('Item deleted');
            loadDirectory(currentPath, false);
            setSelectedFile(null);
        } catch (err) {
            toast.error(`Failed to delete: ${err}`);
        }
    };

    const openInExplorer = async () => {
        try {
            await invoke('open_in_explorer', { path: currentPath });
        } catch (err) {
            toast.error(`Failed to open explorer: ${err}`);
        }
    };

    // Filter files
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/50">
            {/* Top Bar */}
            <div className="flex items-center space-x-2 p-3 bg-slate-900/80 border-b border-white/5">
                {/* Navigation Controls */}
                <div className="flex items-center space-x-1">
                    <button onClick={handleBack} disabled={historyIndex === 0} className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30">
                        <ArrowLeft className="w-5 h-5 text-slate-300" />
                    </button>
                    <button onClick={handleForward} disabled={historyIndex === history.length - 1} className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30">
                        <ArrowRight className="w-5 h-5 text-slate-300" />
                    </button>
                    <button onClick={handleUp} className="p-1.5 rounded-lg hover:bg-white/5">
                        <ArrowUp className="w-5 h-5 text-slate-300" />
                    </button>
                </div>

                {/* Address Bar */}
                <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-md px-3 py-1.5 space-x-2 mx-2">
                    <Monitor className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-500 text-sm">/</span>
                    <input
                        value={currentPath}
                        onChange={(e) => setCurrentPath(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadDirectory(currentPath)}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white font-mono"
                    />
                    <button onClick={() => loadDirectory(currentPath, false)} className="p-1 hover:bg-white/10 rounded">
                        <RefreshCw className={cn("w-3.5 h-3.5 text-slate-400", loading && "animate-spin")} />
                    </button>
                </div>

                {/* Search */}
                <div className="w-64 flex items-center bg-black/40 border border-white/10 rounded-md px-3 py-1.5">
                    <Search className="w-4 h-4 text-slate-500 mr-2" />
                    <input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1 border-l border-white/10 pl-2">
                    <button title="New Folder" onClick={() => setIsCreateFolderOpen(true)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
                        <Plus className="w-5 h-5" />
                    </button>
                    <button title="Open in Explorer" onClick={openInExplorer} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
                        <ExternalLink className="w-5 h-5" />
                    </button>
                    <div className="w-[1px] h-6 bg-white/10 mx-1" />
                    <button
                        title="Grid View"
                        onClick={() => setViewMode('grid')}
                        className={cn("p-2 rounded-lg transition-colors", viewMode === 'grid' ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-white hover:bg-white/5")}
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                    <button
                        title="List View"
                        onClick={() => setViewMode('list')}
                        className={cn("p-2 rounded-lg transition-colors", viewMode === 'list' ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-white hover:bg-white/5")}
                    >
                        <ListIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-60 bg-slate-900/30 border-r border-white/5 flex flex-col p-2 space-y-4 overflow-y-auto">

                    {/* Quick Access / Drives */}
                    <div>
                        <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">This PC</div>
                        <div className="space-y-0.5">
                            {drives.map(drive => (
                                <button
                                    key={drive.mount_point}
                                    onClick={() => loadDirectory(drive.mount_point + (drive.mount_point.endsWith('\\') ? '' : '\\'))}
                                    className={cn(
                                        "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                        currentPath.startsWith(drive.mount_point) ? "bg-cyan-500/10 text-cyan-400" : "text-slate-400 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <HardDrive className="w-4 h-4 shrink-0" />
                                    <div className="flex-1 overflow-hidden">
                                        <div className="truncate">{drive.name || 'Local Disk'} ({drive.mount_point.replace(/\\/g, '')})</div>
                                        <div className="text-[10px] text-slate-600 mt-0.5 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                                            <div
                                                className="h-full bg-cyan-500/50"
                                                style={{ width: `${((drive.total_space - drive.available_space) / drive.total_space) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Common Locations */}
                    <div>
                        <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Access</div>
                        <button onClick={() => loadDirectory('C:/ARKServers/')} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-left text-slate-400 hover:bg-white/5 hover:text-white">
                            <Folder className="w-4 h-4 text-emerald-500" />
                            <span>ARK Servers</span>
                        </button>
                        <button onClick={() => loadDirectory('C:/Users/')} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-left text-slate-400 hover:bg-white/5 hover:text-white">
                            <Folder className="w-4 h-4 text-blue-500" />
                            <span>Users</span>
                        </button>
                    </div>
                </div>

                {/* Main View */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-900/20" onClick={() => setSelectedFile(null)}>
                    {/* Status Bar for Selection Actions */}
                    {selectedFile && (
                        <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center space-x-2 text-sm text-cyan-100">
                                {selectedFile.is_dir ? <Folder className="w-4 h-4" /> : <File className="w-4 h-4" />}
                                <span className="font-medium">{selectedFile.name}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button onClick={() => { setNewName(selectedFile.name); setIsRenameOpen(true); }} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium text-white transition-colors flex items-center">
                                    <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Rename
                                </button>
                                <button onClick={deleteItem} className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-xs font-medium transition-colors flex items-center">
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                                </button>
                            </div>
                        </div>
                    )}

                    {/* File List */}
                    <div className="flex-1 overflow-y-auto p-4" onClick={() => setSelectedFile(null)}>
                        {error ? (
                            <div className="flex items-center justify-center h-full text-red-400">{error}</div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500">Folder is empty</div>
                        ) : (
                            <div className={cn(
                                viewMode === 'grid'
                                    ? "grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4"
                                    : "space-y-1"
                            )}>
                                {filteredFiles.map((file) => (
                                    <div
                                        key={file.path}
                                        onClick={(e) => { e.stopPropagation(); setSelectedFile(file); }}
                                        onDoubleClick={(e) => { e.stopPropagation(); openFile(file); }}
                                        className={cn(
                                            "group rounded-lg transition-all cursor-pointer border border-transparent",
                                            viewMode === 'grid'
                                                ? "flex flex-col items-center p-3 hover:bg-white/5 space-y-2 text-center"
                                                : "flex items-center p-2 hover:bg-white/5 space-x-3",
                                            selectedFile?.path === file.path && "bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                                        )}
                                    >
                                        <div className={cn("relative", viewMode === 'grid' ? "w-12 h-12" : "w-5 h-5")}>
                                            {file.is_dir ? (
                                                <Folder className={cn(
                                                    "w-full h-full text-amber-400 fill-amber-400/20",
                                                    selectedFile?.path === file.path && "text-amber-300"
                                                )} />
                                            ) : (
                                                <FileText className={cn(
                                                    "w-full h-full text-slate-400",
                                                    selectedFile?.path === file.path && "text-cyan-400"
                                                )} />
                                            )}
                                        </div>

                                        <div className={cn("flex-1 min-w-0", viewMode === 'grid' ? "" : "flex items-center justify-between w-full")}>
                                            <span className={cn(
                                                "truncate text-sm font-medium",
                                                viewMode === 'list' && "text-slate-300",
                                                viewMode === 'grid' && "text-slate-300 group-hover:text-white w-full block",
                                                selectedFile?.path === file.path && "text-cyan-400"
                                            )}>
                                                {file.name}
                                            </span>

                                            {viewMode === 'list' && (
                                                <div className="flex items-center space-x-8 text-xs text-slate-500">
                                                    <span className="w-32 text-right">{formatDate(file.last_modified)}</span>
                                                    <span className="w-20 text-right">{file.is_dir ? '-' : formatSize(file.size)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer Info */}
                    <div className="bg-slate-950 px-4 py-1.5 border-t border-white/5 flex items-center space-x-4 text-xs text-slate-500 font-mono">
                        <span>{filteredFiles.length} items</span>
                        {selectedFile && (
                            <>
                                <span className="w-[1px] h-3 bg-slate-700" />
                                <span>{selectedFile.is_dir ? 'Folder' : 'File'}</span>
                                <span className="w-[1px] h-3 bg-slate-700" />
                                <span>{selectedFile.is_dir ? '-' : formatSize(selectedFile.size)}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Editor Modal */}
            {isEditorOpen && editorFile && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8">
                    <div className="w-full max-w-5xl h-[80vh] bg-[#1e1e2e] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                            <div className="flex items-center space-x-3">
                                <FileText className="w-5 h-5 text-cyan-400" />
                                <span className="font-bold text-white">{editorFile.name}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={saveFile}
                                    disabled={saving}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-1.5 rounded-lg text-sm font-bold flex items-center disabled:opacity-50"
                                >
                                    {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save
                                </button>
                                <button
                                    onClick={() => setIsEditorOpen(false)}
                                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            className="flex-1 bg-transparent p-6 font-mono text-sm text-slate-300 resize-none outline-none leading-relaxed"
                            spellCheck={false}
                        />
                    </div>
                </div>
            )}

            {/* Create Folder Modal */}
            {isCreateFolderOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-xl border border-white/10 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-4">Create New Folder</h3>
                        <input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder Name"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-cyan-500/50 mb-4"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setIsCreateFolderOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                            <button onClick={createFolder} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-bold">Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {isRenameOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-xl border border-white/10 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-4">Rename Item</h3>
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="New Name"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-cyan-500/50 mb-4"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && renameItem()}
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setIsRenameOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                            <button onClick={renameItem} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-bold">Rename</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
