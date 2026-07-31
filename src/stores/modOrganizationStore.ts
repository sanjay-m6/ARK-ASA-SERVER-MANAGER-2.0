import { create } from 'zustand';
import { ModCategory, ModCategoryMap, DEFAULT_MOD_CATEGORIES } from '../types/mod-organization';

interface ModOrganizationStore {
  categories: ModCategory[];
  activeCategoryId: string;
  modCategoriesMap: ModCategoryMap; // modId (string) -> categoryId[]
  websiteUrl: string;

  setActiveCategoryId: (id: string) => void;
  setWebsiteUrl: (url: string) => void;
  addCategory: (category: Omit<ModCategory, 'id' | 'isSystem' | 'sortOrder'>) => ModCategory;
  updateCategory: (id: string, updates: Partial<ModCategory>) => void;
  deleteCategory: (id: string) => void;
  assignModToCategory: (modId: string | number, categoryId: string) => void;
  removeModFromCategory: (modId: string | number, categoryId: string) => void;
  setModCategories: (modId: string | number, categoryIds: string[]) => void;
  getModCategoryIds: (modId: string | number) => string[];
  getModCategories: (modId: string | number) => ModCategory[];
  isModInCategory: (modId: string | number, categoryId: string) => boolean;
  autoCategorizeMod: (modId: string | number, name: string, description?: string, tags?: string[]) => void;
  exportCategoriesJson: () => string;
  generateWebShareUrl: (customBaseUrl?: string) => string;
  importCategoriesJson: (jsonOrUrlString: string) => { addedCategoriesCount: number; mappedModsCount: number };
}

const STORAGE_KEY = 'asm_mod_organization_v1';
const LEGACY_PREDEFINED_IDS = new Set(['dino', 'gameplay', 'structures', 'ui_utility']);

const loadSavedState = (): { categories: ModCategory[]; modCategoriesMap: ModCategoryMap; websiteUrl: string } => {
  if (typeof window === 'undefined') {
    return { categories: DEFAULT_MOD_CATEGORIES, modCategoriesMap: {}, websiteUrl: 'https://www.arkservermanager.app/mods' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Filter out legacy predefined categories and merge saved custom categories with system defaults
      const savedCategories: ModCategory[] = (parsed.categories || []).filter(
        (c: ModCategory) => !LEGACY_PREDEFINED_IDS.has(c.id)
      );
      const mergedCategories = [...DEFAULT_MOD_CATEGORIES];
      
      savedCategories.forEach((cat) => {
        if (!mergedCategories.some((c) => c.id === cat.id)) {
          mergedCategories.push(cat);
        }
      });

      const loadedUrl = parsed.websiteUrl && parsed.websiteUrl !== 'https://myarkserver.com/mods' 
        ? parsed.websiteUrl 
        : 'https://www.arkservermanager.app/mods';

      return {
        categories: mergedCategories,
        modCategoriesMap: parsed.modCategoriesMap || {},
        websiteUrl: loadedUrl,
      };
    }
  } catch (e) {
    console.error('Failed to load mod organization state:', e);
  }
  return { categories: DEFAULT_MOD_CATEGORIES, modCategoriesMap: {}, websiteUrl: 'https://www.arkservermanager.app/mods' };
};

const saveState = (categories: ModCategory[], modCategoriesMap: ModCategoryMap, websiteUrl?: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ categories, modCategoriesMap, websiteUrl })
    );
  } catch (e) {
    console.error('Failed to save mod organization state:', e);
  }
};

const savedInitial = loadSavedState();

export const useModOrganizationStore = create<ModOrganizationStore>((set, get) => ({
  categories: savedInitial.categories,
  activeCategoryId: 'all',
  modCategoriesMap: savedInitial.modCategoriesMap,
  websiteUrl: savedInitial.websiteUrl,

  setActiveCategoryId: (id) => set({ activeCategoryId: id }),

  setWebsiteUrl: (url) => {
    set((state) => {
      saveState(state.categories, state.modCategoriesMap, url);
      return { websiteUrl: url };
    });
  },

  addCategory: (newCat) => {
    const id = `custom_${Date.now()}`;
    const category: ModCategory = {
      ...newCat,
      id,
      isSystem: false,
      sortOrder: get().categories.length,
    };

    set((state) => {
      const updatedCategories = [...state.categories, category];
      saveState(updatedCategories, state.modCategoriesMap);
      return { categories: updatedCategories };
    });

    return category;
  },

  updateCategory: (id, updates) => {
    set((state) => {
      const updatedCategories = state.categories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );
      saveState(updatedCategories, state.modCategoriesMap);
      return { categories: updatedCategories };
    });
  },

  deleteCategory: (id) => {
    // Cannot delete system categories
    const target = get().categories.find((c) => c.id === id);
    if (target?.isSystem) return;

    set((state) => {
      const updatedCategories = state.categories.filter((c) => c.id !== id);
      const updatedMap: ModCategoryMap = { ...state.modCategoriesMap };

      // Remove category ID from all mod mappings
      Object.keys(updatedMap).forEach((mId) => {
        updatedMap[mId] = (updatedMap[mId] || []).filter((cId) => cId !== id);
      });

      const nextActive = state.activeCategoryId === id ? 'all' : state.activeCategoryId;

      saveState(updatedCategories, updatedMap);
      return {
        categories: updatedCategories,
        modCategoriesMap: updatedMap,
        activeCategoryId: nextActive,
      };
    });
  },

  assignModToCategory: (modId, categoryId) => {
    const key = String(modId);
    set((state) => {
      const existing = state.modCategoriesMap[key] || [];
      if (existing.includes(categoryId)) return state;

      const updatedMap = {
        ...state.modCategoriesMap,
        [key]: [...existing, categoryId],
      };
      saveState(state.categories, updatedMap);
      return { modCategoriesMap: updatedMap };
    });
  },

  removeModFromCategory: (modId, categoryId) => {
    const key = String(modId);
    set((state) => {
      const existing = state.modCategoriesMap[key] || [];
      const updatedMap = {
        ...state.modCategoriesMap,
        [key]: existing.filter((cId) => cId !== categoryId),
      };
      saveState(state.categories, updatedMap);
      return { modCategoriesMap: updatedMap };
    });
  },

  setModCategories: (modId, categoryIds) => {
    const key = String(modId);
    set((state) => {
      const updatedMap = {
        ...state.modCategoriesMap,
        [key]: Array.from(new Set(categoryIds)),
      };
      saveState(state.categories, updatedMap);
      return { modCategoriesMap: updatedMap };
    });
  },

  getModCategoryIds: (modId) => {
    return get().modCategoriesMap[String(modId)] || [];
  },

  getModCategories: (modId) => {
    const ids = get().getModCategoryIds(modId);
    return get().categories.filter((c) => ids.includes(c.id));
  },

  isModInCategory: (modId, categoryId) => {
    if (categoryId === 'all') return true;
    const ids = get().getModCategoryIds(modId);
    if (ids.includes(categoryId)) return true;

    // Check if auto-matched via heuristics if no manual override
    return false;
  },

  autoCategorizeMod: (modId, name, description = '', tags = []) => {
    const key = String(modId);
    const existing = get().modCategoriesMap[key];
    if (existing && existing.length > 0) return; // Don't overwrite explicit user assignments

    const text = `${name} ${description} ${tags.join(' ')}`.toLowerCase();
    const suggested: string[] = [];

    get().categories.forEach((cat) => {
      if (cat.isSystem) return;
      const catName = cat.name.toLowerCase();
      if (catName.length >= 3 && text.includes(catName)) {
        suggested.push(cat.id);
      }
    });

    if (suggested.length > 0) {
      get().setModCategories(modId, suggested);
    }
  },

  exportCategoriesJson: () => {
    const { categories, modCategoriesMap } = get();
    // Export non-system custom categories + mod map
    const customCategories = categories.filter((c) => !c.isSystem);
    const data = {
      type: 'asm_mod_categories_export',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      customCategories,
      modCategoriesMap,
    };
    return JSON.stringify(data, null, 2);
  },

  generateWebShareUrl: (customBaseUrl) => {
    const { websiteUrl } = get();
    const base = (customBaseUrl || websiteUrl || 'https://www.arkservermanager.app/mods').trim().replace(/\/$/, '');
    const jsonStr = get().exportCategoriesJson();
    let encoded = '';
    try {
      encoded = btoa(encodeURIComponent(jsonStr));
    } catch (e) {
      encoded = btoa(jsonStr);
    }
    return `${base}#data=${encoded}`;
  },

  importCategoriesJson: (jsonOrUrlString: string) => {
    let raw = jsonOrUrlString.trim();

    // Handle website share URLs (extract Base64 data parameter)
    if (raw.includes('data=')) {
      try {
        const parts = raw.split('data=');
        const encodedPart = parts[1].split('&')[0].split('#')[0];
        try {
          raw = decodeURIComponent(atob(encodedPart));
        } catch (e) {
          raw = atob(encodedPart);
        }
      } catch (e) {
        console.warn('Failed to extract payload from URL, attempting raw parse:', e);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid format or share link. Please verify the URL or JSON content.');
    }

    const importedCategories: ModCategory[] = parsed.customCategories || parsed.categories || [];
    const importedMap: ModCategoryMap = parsed.modCategoriesMap || {};

    let addedCategoriesCount = 0;
    let mappedModsCount = 0;

    set((state) => {
      const existingCategories = [...state.categories];

      importedCategories.forEach((cat) => {
        if (!cat.id || cat.isSystem) return;
        const exists = existingCategories.some(
          (c) => c.id === cat.id || c.name.toLowerCase() === cat.name.toLowerCase()
        );
        if (!exists) {
          existingCategories.push({
            ...cat,
            isSystem: false,
            sortOrder: existingCategories.length,
          });
          addedCategoriesCount++;
        }
      });

      const updatedMap: ModCategoryMap = { ...state.modCategoriesMap };

      Object.entries(importedMap).forEach(([modId, cIds]) => {
        if (!Array.isArray(cIds)) return;
        const currentList = updatedMap[modId] || [];
        const mergedList = Array.from(new Set([...currentList, ...cIds]));
        if (mergedList.length > currentList.length) {
          mappedModsCount++;
        }
        updatedMap[modId] = mergedList;
      });

      saveState(existingCategories, updatedMap, state.websiteUrl);

      return {
        categories: existingCategories,
        modCategoriesMap: updatedMap,
      };
    });

    return { addedCategoriesCount, mappedModsCount };
  },
}));
