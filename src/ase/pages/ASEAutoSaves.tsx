import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { useAutoSaveStore, useAutoSaveActions } from '../../stores/autoSaveStore';
import AutoSaveBrowser from '../../components/autosave/AutoSaveBrowser';
import { AutoSave } from '../../types/autosave';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import TimelineView from '../../components/autosave/TimelineView';
import SaveComparison from '../../components/autosave/SaveComparison';
import AutoSavePreferencesPanel from '../../components/autosave/AutoSavePreferences';
import { History, LayoutGrid, GitCompare, Settings } from 'lucide-react';

export default function ASEAutoSaves() {
    const { t } = useTranslation();
    const { servers } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const { loadSaves, restoreSave } = useAutoSaveActions();
    
    const [confirmState, setConfirmState] = useState<{
        action: 'restore' | null;
        save: AutoSave | null;
    }>({ action: null, save: null });
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isConfirmLoading, setIsConfirmLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<'browser' | 'timeline' | 'preferences'>('browser');
    const [showComparison, setShowComparison] = useState(false);

    const saves = useAutoSaveStore(state => state.saves);
    const selectedSaveIds = useAutoSaveStore(state => state.selectedSaveIds);
    const timelineEvents = useAutoSaveStore(state => state.timelineEvents);
    const preferences = useAutoSaveStore(state => state.preferences);

    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    useEffect(() => {
        if (selectedServerId) {
            loadSaves(selectedServerId).catch(console.error);
        }
    }, [selectedServerId, loadSaves]);

    const handleRestoreClick = (save: AutoSave) => {
        setConfirmState({ action: 'restore', save });
        setIsConfirmOpen(true);
    };

    const handleConfirmAction = async () => {
        if (!confirmState.action || !confirmState.save || !selectedServerId) return;
        setIsConfirmLoading(true);

        try {
            if (confirmState.action === 'restore') {
                await restoreSave(selectedServerId, confirmState.save.id, true);
                toast.success('Auto-Save restored successfully.');
            }
        } catch (error) {
            toast.error(`Failed to restore Auto-Save: ${error}`);
        } finally {
            setIsConfirmLoading(false);
            setIsConfirmOpen(false);
            setConfirmState({ action: null, save: null });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
                        ASE Auto-Saves
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Manage, restore, and compare server auto-saves</p>
                </div>

                <div className="flex items-center gap-3">
                    <ServerSelect
                        value={selectedServerId}
                        onChange={setSelectedServerId}
                        servers={servers}
                        accentColor="amber"
                    />

                    <button
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl transition-all duration-300 shadow-lg shadow-amber-500/20 text-xs font-black uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] h-[42px] cursor-pointer"
                        onClick={() => {
                            if (selectedServerId) loadSaves(selectedServerId);
                        }}
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span>Refresh Data</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            {selectedServerId && (
                <div className="flex border-b border-slate-800/80">
                    <button
                        onClick={() => setActiveTab('browser')}
                        className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-250 ${activeTab === 'browser' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <LayoutGrid className="w-4 h-4" /> Browser
                    </button>
                    <button
                        onClick={() => setActiveTab('timeline')}
                        className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-250 ${activeTab === 'timeline' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <History className="w-4 h-4" /> Timeline
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-250 ${activeTab === 'preferences' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Settings className="w-4 h-4" /> Preferences
                    </button>

                    {selectedSaveIds.size === 2 && (
                        <div className="ml-auto flex-shrink-0 flex items-center pr-4">
                            <button
                                onClick={() => setShowComparison(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-xl transition-all duration-300 hover:scale-[1.02]"
                            >
                                <GitCompare className="w-4 h-4" /> Compare Selected
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 min-h-[500px] bg-slate-900/10 backdrop-blur-xl border border-slate-850/80 rounded-3xl overflow-hidden relative flex flex-col">
                {selectedServerId ? (
                    <>
                        {activeTab === 'browser' && (
                            <AutoSaveBrowser
                                serverId={selectedServerId}
                                onRestoreClick={handleRestoreClick}
                                onRefresh={() => loadSaves(selectedServerId)}
                            />
                        )}
                        {activeTab === 'timeline' && (
                            <div className="overflow-y-auto flex-1">
                                <TimelineView events={timelineEvents} />
                            </div>
                        )}
                        {activeTab === 'preferences' && (
                            <div className="overflow-y-auto flex-1">
                                <AutoSavePreferencesPanel 
                                    serverId={selectedServerId} 
                                    initialPreferences={preferences}
                                    onPreferencesUpdated={() => loadSaves(selectedServerId)}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        Select a server to view auto-saves
                    </div>
                )}
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => {
                    if (isConfirmLoading) return;
                    setIsConfirmOpen(false);
                    setConfirmState({ action: null, save: null });
                }}
                onConfirm={handleConfirmAction}
                isLoading={isConfirmLoading}
                title="Restore Auto-Save?"
                message={`Are you sure you want to restore the server to the state saved at ${confirmState.save ? new Date(confirmState.save.createdAt).toLocaleString() : ''}? A safety backup of the current state will be created automatically.`}
                confirmText="Restore State"
                variant="warning"
            />

            {/* Comparison Modal */}
            {showComparison && selectedSaveIds.size === 2 && (() => {
                const arr = Array.from(selectedSaveIds).map(id => saves.get(id)!).filter(Boolean);
                if (arr.length !== 2) return null;
                
                return (
                    <SaveComparison 
                        save1={arr[0]}
                        save2={arr[1]}
                        onClose={() => setShowComparison(false)}
                        onRestore={(save) => {
                            setShowComparison(false);
                            handleRestoreClick(save);
                        }}
                    />
                );
            })()}
        </div>
    );
}
