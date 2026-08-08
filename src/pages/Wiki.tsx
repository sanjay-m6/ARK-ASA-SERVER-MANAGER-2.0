import { useState, useEffect, useMemo } from 'react';
import { readDirectory, readFileContent } from '../utils/tauri';
import HelpDocumentation from '../components/help/HelpDocumentation';
import { 
    Search, 
    FileText, 
    ChevronRight, 
    PanelLeftClose, 
    PanelLeftOpen, 
    X,
    BookOpen,
    Sparkles,
    Folder,
    Layers,
    Cpu,
    Boxes,
    Terminal,
    Bot
} from 'lucide-react';
import { cn } from '../utils/helpers';

interface DocFile {
    name: string;
    path: string;
    title: string;
    category: string;
}

// Clean title formatter to fix acronyms like AIAssistant -> AI Assistant
function formatDocTitle(filename: string): string {
    const base = filename.replace(/\.md$/i, '');
    const knownTitles: Record<string, string> = {
        'AIAssistant': 'AI Assistant',
        'AdvancedConfig': 'Advanced Configuration',
        'BackupManager': 'Backup Manager',
        'Backups': 'Backups System',
        'ClusterManager': 'Cluster Manager',
        'ConfigEditor': 'Config Editor',
        'Dashboard': 'Dashboard & Monitoring',
        'DiscordBot': 'Discord Bot Integration',
        'DiscordIntegration': 'Discord Webhooks & Bridge',
        'FileManager': 'File Manager',
        'Hardware': 'Hardware & Telemetry',
        'HardwareAllocation': 'Hardware Resource Allocation',
        'Logs': 'System Logs Overview',
        'LogsConsole': 'Live Log Stream Console',
        'ModManager': 'Mod Manager & Workshop',
        'Mods': 'Mods Overview',
        'PluginManager': 'Plugin Manager',
        'Plugins': 'Plugins System',
        'RconConsole': 'RCON Console & Commands',
        'Scheduler': 'Automated Tasks & Scheduler',
        'ServerManager': 'Server Manager & Control',
        'Servers': 'Servers Overview',
        'Settings': 'Manager Settings',
        'TribeLogViewer': 'Tribe Log Viewer',
        'UPnPPanel': 'UPnP Port Forwarding'
    };

    if (knownTitles[base]) {
        return knownTitles[base];
    }

    return base
        .replace(/AI/g, ' AI ')
        .replace(/Rcon/g, ' RCON ')
        .replace(/UPnP/g, ' UPnP ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

// Categorizer for sidebar grouping
function getDocCategory(filename: string): { name: string; icon: any } {
    const base = filename.replace(/\.md$/i, '');
    if (['Dashboard', 'ServerManager', 'Servers', 'ConfigEditor', 'AdvancedConfig'].includes(base)) {
        return { name: 'Core Services', icon: Layers };
    }
    if (['AIAssistant', 'Scheduler', 'BackupManager', 'Backups', 'PluginManager', 'Plugins'].includes(base)) {
        return { name: 'Automation & AI', icon: Bot };
    }
    if (['ModManager', 'Mods', 'FileManager'].includes(base)) {
        return { name: 'Mods & Files', icon: Boxes };
    }
    if (['LogsConsole', 'Logs', 'RconConsole', 'Hardware', 'HardwareAllocation', 'TribeLogViewer'].includes(base)) {
        return { name: 'Monitoring & Logs', icon: Terminal };
    }
    return { name: 'Integrations & Tools', icon: Cpu };
}

export default function Wiki() {
    const [files, setFiles] = useState<DocFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
    const [content, setContent] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Initial load: scan documentation/frontend
    useEffect(() => {
        const loadDocFiles = async () => {
            try {
                const docPath = 'documentation/frontend';
                const entries = await readDirectory(docPath);
                
                const docFiles: DocFile[] = entries
                    .filter(e => e.name.endsWith('.md'))
                    .map(e => {
                        const cat = getDocCategory(e.name);
                        return {
                            name: e.name,
                            path: `${docPath}/${e.name}`,
                            title: formatDocTitle(e.name),
                            category: cat.name
                        };
                    })
                    .sort((a, b) => a.title.localeCompare(b.title));

                setFiles(docFiles);
                
                if (docFiles.length > 0 && !selectedFile) {
                    handleSelectFile(docFiles[0]);
                }
            } catch (err) {
                console.error('Failed to load documentation files:', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDocFiles();
    }, []);

    const handleSelectFile = async (file: DocFile) => {
        setSelectedFile(file);
        try {
            const rawContent = await readFileContent(file.path);
            setContent(rawContent);
            if (window.innerWidth < 1024) {
                setIsSidebarOpen(false);
            }
        } catch (err) {
            console.error('Failed to read file content:', err);
            setContent('# Error\nFailed to load documentation content.');
        }
    };

    // Filter files by search or category
    const filteredFiles = useMemo(() => {
        return files.filter(f => {
            const matchesSearch = searchQuery.trim() === '' ||
                f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.category.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesCategory = selectedCategory === null || f.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [files, searchQuery, selectedCategory]);

    // Group files by category for sidebar
    const categorizedFiles = useMemo(() => {
        const groups: Record<string, DocFile[]> = {};
        filteredFiles.forEach(file => {
            if (!groups[file.category]) {
                groups[file.category] = [];
            }
            groups[file.category].push(file);
        });
        return groups;
    }, [filteredFiles]);

    const categories = useMemo(() => {
        const set = new Set(files.map(f => f.category));
        return Array.from(set);
    }, [files]);

    return (
        <div className="flex flex-col h-[calc(100vh-115px)] gap-5">
            {/* Header Banner */}
            <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-600/10 border border-sky-500/30 text-sky-400 shadow-lg shadow-sky-500/10">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                            Knowledge Base
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                {files.length} Guides
                            </span>
                        </h1>
                        <p className="text-xs text-slate-400 mt-0.5">Comprehensive technical guides and operational reference for ARK Server Manager.</p>
                    </div>
                </div>

                {/* Sidebar Toggle & Quick Category Filter */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/40 hover:bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm"
                        title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                    >
                        {isSidebarOpen ? <PanelLeftClose className="w-4 h-4 text-sky-400" /> : <PanelLeftOpen className="w-4 h-4 text-sky-400" />}
                        <span className="hidden sm:inline">{isSidebarOpen ? "Hide Index" : "Show Index"}</span>
                    </button>
                </div>
            </div>

            {/* Main Area: Sidebar + Doc Viewer */}
            <div className="flex-1 flex gap-5 overflow-hidden">
                {/* Sidebar - Article Index */}
                <div className={cn(
                    "flex flex-col gap-3 transition-all duration-300 flex-shrink-0",
                    isSidebarOpen ? "w-80" : "w-0 opacity-0 pointer-events-none overflow-hidden"
                )}>
                    {/* Search & Category Filter */}
                    <div className="space-y-2">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search all guides..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900/80 border border-white/[0.08] rounded-xl py-2.5 pl-10 pr-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/40 focus:bg-black/40 transition-all shadow-inner"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className={cn(
                                    "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer",
                                    selectedCategory === null
                                        ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                                        : "bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/[0.05]"
                                )}
                            >
                                All ({files.length})
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer",
                                        selectedCategory === cat
                                            ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                                            : "bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/[0.05]"
                                    )}
                                >
                                    {cat.split(' ')[0]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Article List Grouped by Category */}
                    <div className="flex-1 overflow-y-auto bg-slate-900/60 border border-white/[0.08] rounded-2xl p-2.5 space-y-4 theme-scrollbar backdrop-blur-xl shadow-xl">
                        {isLoading ? (
                            <div className="flex flex-col gap-2 p-2">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-10 bg-white/[0.04] rounded-lg" />
                                ))}
                            </div>
                        ) : Object.keys(categorizedFiles).length > 0 ? (
                            Object.entries(categorizedFiles).map(([catName, catFiles]) => (
                                <div key={catName} className="space-y-1">
                                    <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span>{catName}</span>
                                        <span className="text-slate-600">{catFiles.length}</span>
                                    </div>

                                    <div className="space-y-1">
                                        {catFiles.map((file) => {
                                            const isSelected = selectedFile?.path === file.path;
                                            return (
                                                <button
                                                    key={file.path}
                                                    onClick={() => handleSelectFile(file)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 group cursor-pointer",
                                                        isSelected
                                                            ? "bg-sky-500/15 text-white border border-sky-500/30 shadow-md shadow-sky-500/5"
                                                            : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <FileText className={cn(
                                                            "w-3.5 h-3.5 flex-shrink-0 transition-colors",
                                                            isSelected ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
                                                        )} />
                                                        <span className="text-xs font-medium truncate">{file.title}</span>
                                                    </div>
                                                    {isSelected && (
                                                        <ChevronRight className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 ml-2" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center">
                                <Folder className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                                <p className="text-xs text-slate-400 font-medium">No matching guides found</p>
                                <p className="text-[11px] text-slate-600 mt-1">Try resetting your search query or filters.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Article Content Viewer */}
                <div className="flex-1 flex flex-col min-w-0 h-full relative">
                    {selectedFile ? (
                        <HelpDocumentation 
                            content={content} 
                            title={selectedFile.title}
                            category={selectedFile.category}
                            className="h-full"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center bg-slate-900/50 rounded-2xl border border-white/[0.08] border-dashed p-8 backdrop-blur-xl">
                            <div className="p-5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-4 shadow-xl">
                                <Sparkles className="w-10 h-10" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Select a Guide to Begin</h3>
                            <p className="text-xs text-slate-400 mt-1.5 max-w-md">Choose a topic from the sidebar index to view detailed operational guides, setup procedures, and troubleshooting steps.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

