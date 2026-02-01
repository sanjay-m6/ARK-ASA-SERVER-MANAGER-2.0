import { Search } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { ConfigCategory } from '../../data/configMappings';

interface ConfigSidebarProps {
    categories: ConfigCategory[];
    activeCategory: string;
    onSelectCategory: (category: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isVisible: boolean;
    isResizing: boolean;
    width: number;
    onStartResize: (e: React.MouseEvent) => void;
}

export default function ConfigSidebar({
    categories,
    activeCategory,
    onSelectCategory,
    searchQuery,
    onSearchChange,
    isVisible,
    isResizing,
    width,
    onStartResize
}: ConfigSidebarProps) {
    if (!isVisible) return null;

    return (
        <div
            className="bg-slate-900 border-r border-slate-800 flex flex-col h-full transition-all duration-300 relative"
            style={{ width: `${width}px` }}
        >
            {/* Fixed Header / Search */}
            <div className="p-4 border-b border-slate-800 bg-slate-900 z-10 shrink-0">
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search settings..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700/50 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:bg-slate-800 transition-all placeholder-slate-500"
                    />
                </div>
            </div>

            {/* Scrollable Category List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
                {categories.map(({ category, info }) => (
                    <button
                        key={category}
                        onClick={() => {
                            onSelectCategory(category);
                            if (searchQuery) onSearchChange('');
                        }}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden shrink-0",
                            activeCategory === category && !searchQuery
                                ? `bg-gradient-to-r ${info.color || 'from-slate-700 to-slate-600'} text-white shadow-lg`
                                : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        {/* Active Indicator Line */}
                        {activeCategory === category && !searchQuery && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-white/50" />
                        )}

                        <span className="text-xl relative z-10 filter drop-shadow-md">{info.icon}</span>
                        <span className="relative z-10">{info.label}</span>

                        {/* Hover glow effect */}
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                ))}
            </div>

            {/* Resize Handle - Inside sidebar */}
            <div
                className={cn(
                    "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-cyan-500/50 transition-colors z-20 group",
                    isResizing && "bg-cyan-500"
                )}
                onMouseDown={onStartResize}
            >
                <div className="absolute top-1/2 right-0.5 -translate-y-1/2 w-1 h-8 bg-slate-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>
    );
}
