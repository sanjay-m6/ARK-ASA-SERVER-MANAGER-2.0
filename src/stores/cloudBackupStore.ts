import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface CloudProviderConfig {
    provider_type: 'S3' | 'B2' | 'GoogleDrive' | 'Dropbox';
    endpoint?: string;
    bucket?: string;
    region?: string;
    access_key_id?: string;
    secret_access_key?: string;
    application_key_id?: string;
    application_key?: string;
    bucket_id?: string;
    client_id?: string;
    client_secret?: string;
    refresh_token?: string;
    root_folder_id?: string;
    access_token?: string;
    root_path?: string;
}

export interface CloudBackupSettings {
    enabled: boolean;
    provider: CloudProviderConfig | null;
    encryption_key: string | null;
    retain_hourly: number;
    retain_daily: number;
    retain_weekly: number;
    compression_level: number;
}

interface CloudBackupStore {
    settings: CloudBackupSettings | null;
    cloudBackups: string[];
    isLoading: boolean;
    fetchSettings: () => Promise<void>;
    saveSettings: (settings: CloudBackupSettings) => Promise<void>;
    testConnection: (config: CloudProviderConfig) => Promise<boolean>;
    fetchBackups: (serverId: string) => Promise<void>;
    triggerBackup: (serverId: string, localPath: string) => Promise<void>;
    restoreBackup: (remotePath: string, extractPath: string) => Promise<void>;
}

export const useCloudBackupStore = create<CloudBackupStore>((set) => ({
    settings: null,
    cloudBackups: [],
    isLoading: false,

    fetchSettings: async () => {
        try {
            set({ isLoading: true });
            const settings = await invoke<CloudBackupSettings>('get_cloud_backup_settings');
            set({ settings, isLoading: false });
        } catch (error) {
            console.error('Failed to fetch cloud backup settings:', error);
            set({ isLoading: false });
        }
    },

    saveSettings: async (settings) => {
        try {
            set({ isLoading: true });
            await invoke('save_cloud_backup_settings', { settings });
            set({ settings, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    testConnection: async (config) => {
        try {
            await invoke('test_cloud_provider_connection', { config });
            return true;
        } catch (error) {
            throw error;
        }
    },

    fetchBackups: async (serverId) => {
        try {
            set({ isLoading: true });
            const cloudBackups = await invoke<string[]>('list_cloud_backups', { serverId: serverId.toString() });
            set({ cloudBackups, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    triggerBackup: async (serverId, localPath) => {
        try {
            await invoke('trigger_manual_cloud_backup', { serverId: serverId.toString(), localBackupPath: localPath });
        } catch (error) {
            throw error;
        }
    },

    restoreBackup: async (remotePath, extractPath) => {
        try {
            await invoke('restore_cloud_backup', { remotePath, targetExtractionPath: extractPath });
        } catch (error) {
            throw error;
        }
    }
}));
