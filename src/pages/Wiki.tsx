import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { readDirectory, readFileContent } from '../utils/tauri';
import HelpDocumentation from '../components/help/HelpDocumentation';
import { 
    Search, 
    FileText, 
    ChevronRight, 
    Menu as MenuIcon, 
    X,
    Clock,
    Star,
    Layout
} from 'lucide-react';
import { cn } from '../utils/helpers';

interface DocFile {
    name: string;
    path: string;
    title: string;
    category: string;
}

export default function Wiki() {
    const { t } = useTranslation();
    const [files, setFiles] = useState<DocFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
    const [content, setContent] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Initial load: scan documentation/frontend
    useEffect(() => {
        const loadDocFiles = async () => {
            try {
                // In production, this path might need to be resolved via resourceDir
                const docPath = 'documentation/frontend';
                const entries = await readDirectory(docPath);
                
                const docFiles: DocFile[] = entries
                    .filter(e => e.name.endsWith('.md'))
                    .map(e => ({
                        name: e.name,
                        path: `${docPath}/${e.name}`,
                        title: e.name.replace('.md', '').replace(/([A-Z])/g, ' $1').trim(),
                        category: 'Frontend'
                    }))
                    .sort((a, b) => a.title.localeCompare(b.title));

                setFiles(docFiles);
                
                // Select first file by default if none selected
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
            // On mobile/small screens, close sidebar after selection
            if (window.innerWidth < 1024) {
                setIsSidebarOpen(false);
            }
        } catch (err) {
            console.error('Failed to read file content:', err);
            setContent('# Error\nFailed to load documentation content.');
        }
    };

    const filteredFiles = files.filter(f => 
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Layout className="w-8 h-8 text-sky-500" />
                        Knowledge Base
                    </h1>
                    <p className="text-slate-400 mt-1">Deep technical guides and documentation for ARK Server Manager.</p>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Sidebar - File List */}
                <div className={cn(
                    "flex flex-col gap-4 transition-all duration-300",
                    isSidebarOpen ? "w-80" : "w-0 opacity-0 pointer-events-none"
                )}>
                    {/* Search */}
                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search guides..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-dark-900/50 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                        />
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto bg-dark-900/30 border border-white/5 rounded-2xl p-2 space-y-1 scrollbar-hide">
                        {isLoading ? (
                            <div className="flex flex-col gap-2 p-2">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-10 bg-white/5 animate-pulse rounded-lg" />
                                ))}
                            </div>
                        ) : filteredFiles.length > 0 ? (
                            filteredFiles.map((file) => (
                                <button
                                    key={file.path}
                                    onClick={() => handleSelectFile(file)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group",
                                        selectedFile?.path === file.path
                                            ? "bg-sky-500/10 text-white border border-sky-500/20"
                                            : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <FileText className={cn(
                                            "w-4 h-4",
                                            selectedFile?.path === file.path ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        <span className="text-sm font-medium">{file.title}</span>
                                    </div>
                                    {selectedFile?.path === file.path && (
                                        <ChevronRight className="w-4 h-4 text-sky-400" />
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="p-8 text-center">
                                <FileText className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                                <p className="text-xs text-slate-500">No results found for "{searchQuery}"</p>
                            </div>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-gradient-to-br from-dark-800 to-dark-900 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-medium text-slate-400">Total Guides</span>
                        </div>
                        <span className="text-sm font-bold text-white">{files.length}</span>
                    </div>
                </div>

                {/* Main Content View */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                    {/* Toggle Sidebar Button (Floating) */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-dark-800 border border-white/10 rounded-full text-slate-400 hover:text-white hover:border-white/20 transition-all shadow-xl"
                    >
                        {isSidebarOpen ? <X className="w-3 h-3" /> : <MenuIcon className="w-3 h-3" />}
                    </button>

                    {selectedFile ? (
                        <HelpDocumentation 
                            content={content} 
                            title={selectedFile.title}
                            className="shadow-2xl shadow-black/40"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center bg-dark-900/30 rounded-2xl border border-white/5 border-dashed">
                            <div className="p-6 rounded-full bg-white/5 mb-4">
                                <Star className="w-12 h-12 text-slate-700" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Select a guide to begin</h3>
                            <p className="text-slate-500 mt-2 max-w-sm">Choose a topic from the sidebar to view detailed instructions and best practices.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
