import { useState, useRef, useEffect } from 'react';
import { Tag, Check } from 'lucide-react';
import { useModOrganizationStore } from '../../stores/modOrganizationStore';

interface ModCategorySelectorProps {
  modId: string | number;
  modName: string;
  modDescription?: string;
  modTags?: string[];
  className?: string;
}

export default function ModCategorySelector({
  modId,
  modName,
  modDescription,
  modTags,
  className = '',
}: ModCategorySelectorProps) {
  const { 
    categories, getModCategoryIds, assignModToCategory, 
    removeModFromCategory, autoCategorizeMod 
  } = useModOrganizationStore();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const assignedCategoryIds = getModCategoryIds(modId);
  const filterableCategories = categories.filter((c) => c.id !== 'all');

  // Trigger auto-categorize heuristic on mount if unassigned
  useEffect(() => {
    autoCategorizeMod(modId, modName, modDescription, modTags);
  }, [modId, modName, modDescription, modTags, autoCategorizeMod]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const assignedCategories = categories.filter((c) =>
    assignedCategoryIds.includes(c.id)
  );

  const toggleCategory = (catId: string) => {
    if (assignedCategoryIds.includes(catId)) {
      removeModFromCategory(modId, catId);
    } else {
      assignModToCategory(modId, catId);
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Category Pills & Trigger Button */}
      <div className="flex flex-wrap items-center gap-2">
        {assignedCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105 shadow-sm border backdrop-blur-md"
            style={{ 
              backgroundColor: `${cat.color}20`, 
              borderColor: `${cat.color}50`,
              color: cat.color,
              boxShadow: `0 0 10px ${cat.color}15`
            }}
            title={`Assigned to ${cat.name}. Click to edit.`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: cat.color }}
            />
            <span>{cat.name}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-white/10 hover:border-sky-500/40 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          title="Assign or edit categories"
        >
          <Tag className="w-3.5 h-3.5 text-sky-400" />
          <span>{assignedCategories.length === 0 ? 'Categorize' : '+ Add'}</span>
        </button>
      </div>

      {/* Glassmorphic Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2.5 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 border-b border-slate-800 mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-sky-400" />
              <span>Assign Categories</span>
            </span>
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
            {filterableCategories.map((cat) => {
              const isAssigned = assignedCategoryIds.includes(cat.id);

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    isAssigned
                      ? 'bg-slate-800 text-white border border-slate-700/60 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </div>

                  {isAssigned && <Check className="w-3.5 h-3.5 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
