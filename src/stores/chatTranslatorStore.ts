import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { TranslatorConfig, TranslatorPlayerPref, TranslatorStats } from '../types/chat_translator.types';

interface ChatTranslatorStore {
  config: TranslatorConfig | null;
  playerPrefs: TranslatorPlayerPref[];
  stats: TranslatorStats | null;
  isLoading: boolean;

  fetchConfig: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  saveConfig: (config: TranslatorConfig) => Promise<void>;
  fetchPlayerPrefs: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  savePlayerPref: (pref: TranslatorPlayerPref) => Promise<void>;
  deletePlayerPref: (steamId: string, serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  fetchStats: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  resetStats: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  installPlugin: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
  uninstallPlugin: (serverId: number, serverType: 'ASA' | 'ASE') => Promise<void>;
}

export const useChatTranslatorStore = create<ChatTranslatorStore>((set) => ({
  config: null,
  playerPrefs: [],
  stats: null,
  isLoading: false,

  fetchConfig: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      const config = await invoke<TranslatorConfig>('get_translator_config', { serverId, serverType });
      set({ config, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch translator config:', error);
      set({ isLoading: false });
    }
  },

  saveConfig: async (config) => {
    try {
      set({ isLoading: true });
      await invoke('save_translator_config', { config });
      set({ config, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  fetchPlayerPrefs: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      const playerPrefs = await invoke<TranslatorPlayerPref[]>('get_translator_player_prefs', { serverId, serverType });
      set({ playerPrefs, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch player translator prefs:', error);
      set({ isLoading: false });
    }
  },

  savePlayerPref: async (pref) => {
    try {
      set({ isLoading: true });
      await invoke('save_translator_player_pref', { pref });
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  deletePlayerPref: async (steamId, serverId, serverType) => {
    try {
      set({ isLoading: true });
      await invoke('delete_translator_player_pref', { steamId, serverId, serverType });
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  fetchStats: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      const stats = await invoke<TranslatorStats>('get_translator_stats', { serverId, serverType });
      set({ stats, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch translator stats:', error);
      set({ isLoading: false });
    }
  },

  resetStats: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      await invoke('reset_translator_stats', { serverId, serverType });
      const stats = await invoke<TranslatorStats>('get_translator_stats', { serverId, serverType });
      set({ stats, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  installPlugin: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      await invoke('install_translator_plugin', { serverId, serverType });
      // Fetch fresh config & stats after installation
      const config = await invoke<TranslatorConfig>('get_translator_config', { serverId, serverType });
      const stats = await invoke<TranslatorStats>('get_translator_stats', { serverId, serverType });
      set({ config, stats, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  uninstallPlugin: async (serverId, serverType) => {
    try {
      set({ isLoading: true });
      await invoke('uninstall_translator_plugin', { serverId, serverType });
      set({ config: null, stats: null, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  }
}));
