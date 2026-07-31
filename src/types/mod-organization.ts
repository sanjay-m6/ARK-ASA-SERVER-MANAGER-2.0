// TypeScript types for Mod Organization System

export interface ModCategory {
  id: string;
  name: string;
  description?: string;
  color: string; // CSS color string or hex color
  icon?: string;
  isSystem?: boolean;
  sortOrder: number;
}

export type ModCategoryMap = Record<string, string[]>; // modId -> array of categoryIds

export const DEFAULT_MOD_CATEGORIES: ModCategory[] = [
  {
    id: 'all',
    name: 'All Mods',
    description: 'View all installed and searched mods',
    color: '#0284c7', // Sky Blue
    icon: 'Layers',
    isSystem: true,
    sortOrder: 0,
  },
];
