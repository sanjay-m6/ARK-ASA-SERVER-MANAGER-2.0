import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Filter, Plus, Folder, Trash2, Edit2, Check, X, 
  Layers, Footprints, Gamepad2, Building2, Wrench, Sparkles, SlidersHorizontal,
  Share2, Upload, Copy
} from 'lucide-react';
import { useModOrganizationStore } from '../../stores/modOrganizationStore';
import { ModCategory } from '../../types/mod-organization';
import { toast } from 'react-hot-toast';

const PRESET_COLORS = [
  '#0284c7', // Sky Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
];

const renderCategoryIcon = (iconName?: string, className = 'w-4 h-4') => {
  switch (iconName) {
    case 'Footprints':
      return <Footprints className={className} />;
    case 'Gamepad2':
      return <Gamepad2 className={className} />;
    case 'Building2':
      return <Building2 className={className} />;
    case 'Wrench':
      return <Wrench className={className} />;
    case 'Layers':
    default:
      return <Layers className={className} />;
  }
};

interface ModOrganizationBarProps {
  modCountMap?: Record<string, number>; // categoryId -> count
  className?: string;
}

export default function ModOrganizationBar({ modCountMap = {}, className = '' }: ModOrganizationBarProps) {
  const { 
    categories, activeCategoryId, setActiveCategoryId, 
    addCategory, updateCategory, deleteCategory,
    importCategoriesJson, modCategoriesMap
  } = useModOrganizationStore();

  const [showManageModal, setShowManageModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [copiedModIds, setCopiedModIds] = useState(false);

  // Compute Mod IDs string for active category or all custom categories
  const activeCatName = categories.find(c => c.id === activeCategoryId)?.name || 'All Mods';
  const modIdsString = useMemo(() => {
    const map = modCategoriesMap || {};
    let ids: string[] = [];

    if (activeCategoryId && activeCategoryId !== 'all') {
      ids = Object.entries(map)
        .filter(([, catIds]) => Array.isArray(catIds) && catIds.includes(activeCategoryId))
        .map(([modId]) => String(modId));
    } else {
      const allSet = new Set<string>();
      Object.keys(map).forEach(id => {
        if (map[id] && map[id].length > 0) allSet.add(String(id));
      });
      ids = Array.from(allSet);
    }

    return ids.join(',');
  }, [modCategoriesMap, activeCategoryId]);

  const handleCopyModIds = () => {
    if (!modIdsString) {
      toast.error('No mods in this category yet.');
      return;
    }
    navigator.clipboard.writeText(modIdsString).then(() => {
      setCopiedModIds(true);
      toast.success('Mod IDs copied to clipboard!');
      setTimeout(() => setCopiedModIds(false), 2500);
    }).catch(() => {
      toast.error('Clipboard access denied.');
    });
  };

  const [editingCategory, setEditingCategory] = useState<ModCategory | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0284c7');
  const [newCatDesc, setNewCatDesc] = useState('');

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: newCatName.trim(),
        color: newCatColor,
        description: newCatDesc.trim() || undefined,
      });
      toast.success(`Category "${newCatName}" updated!`);
      setEditingCategory(null);
    } else {
      const created = addCategory({
        name: newCatName.trim(),
        color: newCatColor,
        description: newCatDesc.trim() || undefined,
      });
      toast.success(`Category "${created.name}" created!`);
    }

    setNewCatName('');
    setNewCatDesc('');
    setNewCatColor('#0284c7');
  };

  const handleStartEdit = (cat: ModCategory) => {
    setEditingCategory(cat);
    setNewCatName(cat.name);
    setNewCatColor(cat.color);
    setNewCatDesc(cat.description || '');
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete category "${name}"?`)) {
      deleteCategory(id);
      toast.success(`Category "${name}" deleted.`);
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJsonText.trim()) return;

    try {
      const res = importCategoriesJson(importJsonText.trim());
      toast.success(`Imported ${res.addedCategoriesCount} new categories & updated ${res.mappedModsCount} mod mappings!`);
      setImportJsonText('');
      setShowImportModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Invalid JSON format. Check format and retry.');
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Category Bar Container */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-2.5 backdrop-blur-xl shadow-xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Header Label & Category Badges */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider border-r border-slate-800 mr-1">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>Categories</span>
          </div>

          {categories.map((cat) => {
            const isActive = activeCategoryId === cat.id;
            const count = modCountMap[cat.id] ?? 0;

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`group relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border whitespace-nowrap shadow-sm ${
                  isActive
                    ? 'bg-slate-800/90 text-white shadow-md'
                    : 'bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-slate-800/80'
                }`}
                style={{
                  borderColor: isActive ? cat.color : undefined,
                  boxShadow: isActive ? `0 0 12px ${cat.color}25` : undefined,
                }}
              >
                <span 
                  className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex items-center gap-1.5">
                  {renderCategoryIcon(cat.icon, 'w-3.5 h-3.5 opacity-80')}
                  <span>{cat.name}</span>
                </span>

                {count > 0 && (
                  <span 
                    className={`ml-1 px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                      isActive ? 'bg-white/10 text-white font-bold' : 'bg-slate-800/60 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Manage, Share & Import Action Group */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-700/60 hover:border-sky-500/40 rounded-xl transition-all text-xs font-semibold"
            title="Copy Comma-Separated Mod IDs for active category"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Mod IDs</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-purple-400 hover:text-purple-300 border border-slate-700/60 hover:border-purple-500/40 rounded-xl transition-all text-xs font-semibold"
            title="Import Categories setup from JSON / Share Code"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <button
            onClick={() => setShowManageModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 hover:border-sky-500/40 rounded-xl transition-all text-xs font-semibold"
            title="Customize & Add Mod Categories"
          >
            <Folder className="w-3.5 h-3.5 text-sky-400" />
            <span>Mod Organization</span>
            <Sparkles className="w-3 h-3 text-amber-400 opacity-80" />
          </button>
        </div>
      </div>

      {/* Category Management Modal */}
      {showManageModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-sky-950/40 my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-sky-400" />
                  Mod Categories & Organization
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Create custom mod folders and categorize your mods
                </p>
              </div>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setEditingCategory(null);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - 2 Column Side-by-Side Layout */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Left Side: Create / Edit Category Form (5 Columns) */}
                <div className="md:col-span-5 space-y-4">
                  <form onSubmit={handleCreateCategory} className="bg-slate-950/60 rounded-xl p-5 border border-slate-800 space-y-4">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>{editingCategory ? 'Edit Category' : 'Create New Category'}</span>
                      {editingCategory && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(null);
                            setNewCatName('');
                            setNewCatDesc('');
                            setNewCatColor('#0284c7');
                          }}
                          className="text-xs text-sky-400 hover:underline font-semibold"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </h3>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Category Name</label>
                        <input
                          type="text"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="e.g. Dino Mods, Gameplay Mods, Boss Arena"
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Description (Optional)</label>
                        <input
                          type="text"
                          value={newCatDesc}
                          onChange={(e) => setNewCatDesc(e.target.value)}
                          placeholder="Brief description of this mod collection"
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Tag Color</label>
                        <div className="flex flex-wrap items-center gap-2.5">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewCatColor(c)}
                              className={`w-6 h-6 rounded-full transition-transform ${
                                newCatColor === c ? 'scale-125 ring-2 ring-white shadow-lg' : 'hover:scale-110 opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <label 
                            className="relative w-6 h-6 rounded-full cursor-pointer border border-slate-600 hover:scale-110 transition-transform flex items-center justify-center shrink-0 shadow-sm"
                            style={{ backgroundColor: newCatColor }}
                            title="Custom Color Picker"
                          >
                            <input
                              type="color"
                              value={newCatColor}
                              onChange={(e) => setNewCatColor(e.target.value)}
                              className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                            />
                            <Plus className="w-3.5 h-3.5 text-white drop-shadow pointer-events-none" />
                          </label>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!newCatName.trim()}
                      className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                    >
                      {editingCategory ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span>{editingCategory ? 'Update Category' : 'Add Category'}</span>
                    </button>
                  </form>
                </div>

                {/* Right Side: Active Categories List (7 Columns) */}
                <div className="md:col-span-7 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Active Categories ({categories.length})</span>
                  </h3>

                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className={`flex items-center justify-between p-3.5 bg-slate-950/50 border rounded-xl transition-all ${
                          editingCategory?.id === cat.id ? 'border-sky-500/60 bg-sky-950/20' : 'border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span 
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" 
                            style={{ backgroundColor: cat.color }} 
                          />
                          <div>
                            <p className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{cat.name}</span>
                              {cat.isSystem && (
                                <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] uppercase font-bold rounded">
                                  System
                                </span>
                              )}
                            </p>
                            {cat.description && (
                              <p className="text-slate-400 text-xs mt-0.5">{cat.description}</p>
                            )}
                          </div>
                        </div>

                        {!cat.isSystem && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStartEdit(cat)}
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Edit Category"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(cat.id, cat.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Delete Category"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowManageModal(false);
                    setShowShareModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Profile</span>
                </button>
                <button
                  onClick={() => {
                    setShowManageModal(false);
                    setShowImportModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Setup</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setShowManageModal(false);
                  setEditingCategory(null);
                }}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Copy Mod IDs Modal */}
      {showShareModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Copy className="w-5 h-5 text-sky-400" />
                Copy Mod IDs
              </h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Category: <span className="font-bold text-sky-400">{activeCatName}</span>
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {modIdsString ? `${modIdsString.split(',').length} Mods` : '0 Mods'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Mod IDs (Comma-Separated)</label>
                <textarea
                  readOnly
                  value={modIdsString || 'No mods in this category yet.'}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-sky-300 focus:outline-none custom-scrollbar break-all select-all"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  onClick={handleCopyModIds}
                  disabled={!modIdsString}
                  className="px-5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50"
                >
                  {copiedModIds ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedModIds ? 'Copied Mod IDs!' : 'Copy Mod IDs'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Import Categories Modal */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-400" />
                Import Mod Categories & Setup
              </h3>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-400 text-xs">
              Paste a share link (<span className="font-mono text-sky-300">#data=...</span>) or raw JSON setup code:
            </p>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='Paste share link or JSON code here...'
                rows={6}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/80 rounded-xl p-3.5 font-mono text-xs text-white focus:outline-none custom-scrollbar"
              />

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!importJsonText.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import JSON</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
