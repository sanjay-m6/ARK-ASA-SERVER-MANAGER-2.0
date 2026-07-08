import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Zap, Plus, Trash2, Edit2, Play, Square, Loader2, Check,
    Sparkles, ChevronRight, X
} from 'lucide-react';
import {
    getAseBoostProfiles, saveAseBoostProfile, deleteAseBoostProfile,
    getActiveAseBoostProfile, activateAseBoostProfile, deactivateAseBoostProfile,
    getAllServers
} from '../../../utils/tauri';
import { type AseBoostProfile } from '../../../types';
import ServerSelect from '../../../components/ui/ServerSelect';
import toast from 'react-hot-toast';

export default function ASEBoostManager() {
    const { t } = useTranslation();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [profiles, setProfiles] = useState<AseBoostProfile[]>([]);
    const [activeProfile, setActiveProfile] = useState<AseBoostProfile | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState<number | null>(null);
    const [isDeactivating, setIsDeactivating] = useState(false);
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<AseBoostProfile | null>(null);
    const [name, setName] = useState('');
    const [xp, setXp] = useState(2.0);
    const [taming, setTaming] = useState(2.0);
    const [harvest, setHarvest] = useState(2.0);
    const [mating, setMating] = useState(1.0);
    const [hatch, setHatch] = useState(2.0);
    const [mature, setMature] = useState(2.0);

    useEffect(() => {
        getAllServers()
            .then((s) => {
                const aseServers = s.filter(srv => srv.serverType === 'ASE');
                if (aseServers.length > 0) setSelectedServerId(aseServers[0].id);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (selectedServerId) {
            loadProfiles();
        }
    }, [selectedServerId]);

    const loadProfiles = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const pList = await getAseBoostProfiles(selectedServerId);
            setProfiles(pList);
            const active = await getActiveAseBoostProfile(selectedServerId);
            setActiveProfile(active);
        } catch (error) {
            toast.error(t('boost.loadFailed', 'Falha ao carregar perfis de boost'));
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenCreateModal = () => {
        setEditingProfile(null);
        setName('');
        setXp(2.0);
        setTaming(2.0);
        setHarvest(2.0);
        setMating(1.0);
        setHatch(2.0);
        setMature(2.0);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (profile: AseBoostProfile) => {
        setEditingProfile(profile);
        setName(profile.name);
        setXp(profile.xpMultiplier);
        setTaming(profile.tamingMultiplier);
        setHarvest(profile.harvestMultiplier);
        setMating(profile.matingMultiplier);
        setHatch(profile.hatchMultiplier);
        setMature(profile.matureMultiplier);
        setIsModalOpen(true);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedServerId) return;
        if (!name.trim()) {
            toast.error(t('boost.nameRequired', 'Nome do perfil é obrigatório'));
            return;
        }

        try {
            const profileData: AseBoostProfile = {
                id: editingProfile?.id,
                serverId: selectedServerId,
                name: name.trim(),
                xpMultiplier: xp,
                tamingMultiplier: taming,
                harvestMultiplier: harvest,
                matingMultiplier: mating,
                hatchMultiplier: hatch,
                matureMultiplier: mature,
                active: editingProfile ? editingProfile.active : false,
            };

            await saveAseBoostProfile(profileData);
            toast.success(t('boost.saveSuccess', 'Perfil de boost salvo com sucesso!'));
            setIsModalOpen(false);
            loadProfiles();
        } catch (error) {
            toast.error(String(error));
        }
    };

    const handleDeleteProfile = async (id: number) => {
        if (!window.confirm(t('boost.confirmDelete', 'Tem certeza que deseja deletar este perfil?'))) return;
        try {
            await deleteAseBoostProfile(id);
            toast.success(t('boost.deleteSuccess', 'Perfil de boost deletado'));
            loadProfiles();
        } catch (error) {
            toast.error(String(error));
        }
    };

    const handleActivateProfile = async (profile: AseBoostProfile) => {
        if (!profile.id || !selectedServerId) return;
        setIsActionLoading(profile.id);
        try {
            toast.loading(t('boost.activatingText', 'Reiniciando o servidor e aplicando taxas do evento...'), { id: 'boost-action' });
            await activateAseBoostProfile(selectedServerId, profile.id);
            toast.success(t('boost.activateSuccess', 'Evento de Boost ativado com sucesso!'), { id: 'boost-action' });
            loadProfiles();
        } catch (error) {
            toast.error(String(error), { id: 'boost-action' });
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleDeactivateBoost = async () => {
        if (!selectedServerId) return;
        setIsDeactivating(true);
        try {
            toast.loading(t('boost.deactivatingText', 'Reiniciando o servidor e restaurando taxas originais...'), { id: 'boost-action' });
            await deactivateAseBoostProfile(selectedServerId);
            toast.success(t('boost.deactivateSuccess', 'Boost desativado e taxas originais restauradas!'), { id: 'boost-action' });
            loadProfiles();
        } catch (error) {
            toast.error(String(error), { id: 'boost-action' });
        } finally {
            setIsDeactivating(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 flex items-center gap-3">
                        <Zap className="w-10 h-10 text-orange-400 animate-pulse" />
                        {t('boost.title', 'Gerenciador de Boost (ASE)')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                        {t('boost.subtitle', 'Configure eventos sazonais temporários e multiplique as taxas do servidor de forma segura.')}
                    </p>
                </div>
                <button
                    onClick={handleOpenCreateModal}
                    disabled={!selectedServerId}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl shadow-lg shadow-orange-500/20 font-medium transition-all disabled:opacity-50"
                >
                    <Plus className="w-5 h-5" />
                    <span>{t('boost.newProfile', '+ Novo Perfil')}</span>
                </button>
            </div>

            {/* Info Banner */}
            <div className="glass-panel rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5 flex items-start gap-4">
                <Sparkles className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <h4 className="font-bold text-amber-200">{t('boost.bannerTitle', 'Como funciona o Gerenciador de Boost?')}</h4>
                    <p className="text-sm text-amber-100/70 leading-relaxed">
                        Ao ativar um perfil de boost, o manager realiza broadcasts periódicos via RCON para notificar os jogadores. Em seguida, desliga o servidor com segurança, cria cópias de segurança das configurações originais (.boostbackup) e injeta os novos multiplicadores. Ao desativar, as configurações de backup são restauradas perfeitamente.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-amber-300/80 font-medium mt-2">
                        <span>{t('boost.setupTip', 'Para automação, configure tarefas do tipo BoostStart / BoostEnd no Agendador')}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                </div>
            </div>

            {/* Server Selector & Current Status */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <ServerSelect 
                        value={selectedServerId} 
                        onChange={setSelectedServerId} 
                        accentColor="amber" 
                    />
                </div>
                {activeProfile ? (
                    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-full md:w-auto">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                            <div>
                                <p className="text-xs text-emerald-400/70 uppercase font-bold tracking-wider">{t('boost.activeEvent', 'Evento Ativo')}</p>
                                <p className="text-emerald-300 font-bold text-sm">{activeProfile.name}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleDeactivateBoost}
                            disabled={isDeactivating}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                        >
                            {isDeactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                            <span>{t('boost.deactivate', 'Desativar Evento')}</span>
                        </button>
                    </div>
                ) : (
                    <div className="px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-xl text-slate-400 text-sm font-medium w-full md:w-auto text-center">
                        {t('boost.noActiveEvent', 'Nenhum perfil de boost ativo neste servidor')}
                    </div>
                )}
            </div>

            {/* Profiles List */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-400 mb-3" />
                    <p className="text-lg">{t('boost.loading', 'Carregando perfis...')}</p>
                </div>
            ) : profiles.length === 0 ? (
                <div className="text-center py-16 glass-panel rounded-2xl border border-slate-700/50">
                    <Zap className="w-16 h-16 mx-auto mb-4 text-slate-600 opacity-30" />
                    <p className="text-slate-400 text-lg font-medium">{t('boost.noProfiles', 'Nenhum perfil de boost cadastrado')}</p>
                    <p className="text-slate-500 text-sm mt-1">{t('boost.noProfilesDesc', 'Crie um novo perfil para começar a configurar taxas sazonais.')}</p>
                    <button
                        onClick={handleOpenCreateModal}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 rounded-xl text-sm font-semibold transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        <span>{t('boost.createFirst', 'Criar Primeiro Perfil')}</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {profiles.map((profile) => {
                        const isActive = activeProfile?.id === profile.id;
                        return (
                            <div 
                                key={profile.id}
                                className={`glass-panel rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                                    isActive 
                                    ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5 bg-emerald-500/[0.02]' 
                                    : 'border-slate-700/60 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/[0.02]'
                                }`}
                            >
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xl font-bold text-white tracking-tight">{profile.name}</h3>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleOpenEditModal(profile)}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
                                                title="Editar"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => profile.id && handleDeleteProfile(profile.id)}
                                                className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-300 rounded-lg transition-all"
                                                title="Deletar"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Multipliers List */}
                                    <div className="grid grid-cols-2 gap-3.5 my-5">
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">XP Multiplier</p>
                                            <p className="text-orange-400 font-bold text-lg">{profile.xpMultiplier}x</p>
                                        </div>
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Taming Speed</p>
                                            <p className="text-orange-400 font-bold text-lg">{profile.tamingMultiplier}x</p>
                                        </div>
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Harvesting</p>
                                            <p className="text-orange-400 font-bold text-lg">{profile.harvestMultiplier}x</p>
                                        </div>
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Mating Interval</p>
                                            <p className="text-amber-400/90 font-bold text-lg">{profile.matingMultiplier}x</p>
                                        </div>
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Egg Hatch</p>
                                            <p className="text-amber-400/90 font-bold text-lg">{profile.hatchMultiplier}x</p>
                                        </div>
                                        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Baby Mature</p>
                                            <p className="text-amber-400/90 font-bold text-lg">{profile.matureMultiplier}x</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-800/60 p-4 bg-slate-900/[0.15]">
                                    {isActive ? (
                                        <div className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-semibold">
                                            <Check className="w-4 h-4" />
                                            <span>{t('boost.active', 'Ativo')}</span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleActivateProfile(profile)}
                                            disabled={isActionLoading !== null}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600/10 hover:bg-orange-600 hover:text-white text-orange-400 border border-orange-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                                        >
                                            {isActionLoading === profile.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Play className="w-4 h-4" />
                                            )}
                                            <span>{t('boost.activateBtn', 'Ativar no Servidor')}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative">
                        <div className="flex items-center justify-between border-b border-slate-850 p-5">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Zap className="w-5 h-5 text-orange-400" />
                                {editingProfile ? t('boost.editTitle', 'Editar Perfil de Boost') : t('boost.newTitle', 'Novo Perfil de Boost')}
                            </h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
                            {/* Profile Name */}
                            <div className="space-y-1.5">
                                <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('boost.profileName', 'Nome do Perfil')}</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Fim de Semana 2x, Evento de Páscoa"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-all font-medium"
                                />
                            </div>

                            {/* Multipliers Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">XP Multiplier</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={xp}
                                        onChange={(e) => setXp(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Taming Speed</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={taming}
                                        onChange={(e) => setTaming(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Harvesting Amount</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={harvest}
                                        onChange={(e) => setHarvest(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Mating Interval</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.01"
                                        value={mating}
                                        onChange={(e) => setMating(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Egg Hatch Speed</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={hatch}
                                        onChange={(e) => setHatch(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Baby Maturation</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={mature}
                                        onChange={(e) => setMature(parseFloat(e.target.value) || 1.0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-all font-mono font-bold"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 border-t border-slate-850 pt-5 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-all"
                                >
                                    {t('common.cancel', 'Cancelar')}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20 transition-all"
                                >
                                    {t('common.save', 'Salvar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
