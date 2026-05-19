import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface IniEntry {
  key: string;
  value: string;
  comment?: string | null;
}

export interface IniSection {
  name: string;
  entries: IniEntry[];
}

export interface IniData {
  sections: IniSection[];
}

interface AseConfigState {
  currentData: IniData | null;
  rawData: string | null;
  isDirty: boolean;
  activeFile: string;
  isLoading: boolean;
  
  // Actions
  setActiveFile: (filename: string) => void;
  loadIni: (serverId: number, filename: string) => Promise<void>;
  saveIni: (serverId: number, isRaw?: boolean) => Promise<void>;
  
  // Structured edits
  updateEntry: (sectionName: string, key: string, value: string) => void;
  addEntry: (sectionName: string, key: string, value: string) => void;
  removeEntry: (sectionName: string, key: string) => void;
  
  // Raw edits
  setRawData: (data: string) => void;
}

export const useAseConfigStore = create<AseConfigState>((set, get) => ({
  currentData: null,
  rawData: null,
  isDirty: false,
  activeFile: 'GameUserSettings.ini',
  isLoading: false,

  setActiveFile: (filename) => {
    set({ activeFile: filename, currentData: null, rawData: null, isDirty: false });
  },

  loadIni: async (serverId, filename) => {
    set({ isLoading: true });
    try {
      const data: IniData = await invoke('read_ase_ini', { serverId, filename });
      const raw: string = await invoke('read_ase_ini_raw', { serverId, filename });
      set({ currentData: data, rawData: raw, isDirty: false, isLoading: false });
    } catch (error) {
      console.error('Failed to load INI:', error);
      set({ currentData: { sections: [] }, rawData: '', isDirty: false, isLoading: false });
    }
  },

  saveIni: async (serverId, isRaw = false) => {
    const { activeFile, currentData, rawData } = get();
    
    try {
      if (isRaw) {
        if (rawData === null) return;
        await invoke('write_ase_ini_raw', { serverId, filename: activeFile, content: rawData });
      } else {
        if (!currentData) return;
        await invoke('write_ase_ini', { serverId, filename: activeFile, data: currentData });
      }
      // Reload to ensure sync
      await get().loadIni(serverId, activeFile);
    } catch (error) {
      console.error('Failed to save INI:', error);
      throw error;
    }
  },

  updateEntry: (sectionName, key, value) => {
    set((state) => {
      if (!state.currentData) return state;
      const sections = [...state.currentData.sections];
      const secIndex = sections.findIndex(s => s.name === sectionName);
      
      if (secIndex >= 0) {
        // If entry exists, update it. If multiple exist, update the first one.
        const sec = { ...sections[secIndex] };
        const entries = [...sec.entries];
        const entryIndex = entries.findIndex(e => e.key === key);
        
        if (entryIndex >= 0) {
          entries[entryIndex] = { ...entries[entryIndex], value };
        } else {
          entries.push({ key, value });
        }
        sec.entries = entries;
        sections[secIndex] = sec;
      } else {
        // Create section and entry
        sections.push({
          name: sectionName,
          entries: [{ key, value }]
        });
      }

      return { currentData: { sections }, isDirty: true };
    });
  },

  addEntry: (sectionName, key, value) => {
    set((state) => {
      if (!state.currentData) return state;
      const sections = [...state.currentData.sections];
      const secIndex = sections.findIndex(s => s.name === sectionName);
      
      if (secIndex >= 0) {
        const sec = { ...sections[secIndex] };
        sec.entries = [...sec.entries, { key, value }];
        sections[secIndex] = sec;
      } else {
        sections.push({
          name: sectionName,
          entries: [{ key, value }]
        });
      }

      return { currentData: { sections }, isDirty: true };
    });
  },

  removeEntry: (sectionName, key) => {
    set((state) => {
      if (!state.currentData) return state;
      const sections = [...state.currentData.sections];
      const secIndex = sections.findIndex(s => s.name === sectionName);
      
      if (secIndex >= 0) {
        const sec = { ...sections[secIndex] };
        sec.entries = sec.entries.filter(e => e.key !== key);
        sections[secIndex] = sec;
      }

      return { currentData: { sections }, isDirty: true };
    });
  },

  setRawData: (data) => {
    set({ rawData: data, isDirty: true });
  }
}));
