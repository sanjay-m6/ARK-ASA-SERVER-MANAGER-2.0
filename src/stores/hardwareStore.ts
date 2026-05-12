import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface CpuTopology {
  logical_cores: number;
  physical_cores: number;
}

export interface HardwareAllocation {
  serverId: number;
  useAllCores: boolean;
  cpuAffinity: string; // JSON array string
  processPriority: string; // 'Normal', 'AboveNormal', 'High', 'RealTime', 'BelowNormal', 'Idle'
}

interface HardwareState {
  cpuTopology: CpuTopology | null;
  allocations: Record<number, HardwareAllocation>;
  loading: boolean;
  error: string | null;

  fetchTopology: () => Promise<void>;
  fetchAllocation: (serverId: number) => Promise<void>;
  saveAllocation: (allocation: HardwareAllocation) => Promise<void>;
}

export const useHardwareStore = create<HardwareState>((set) => ({
  cpuTopology: null,
  allocations: {},
  loading: false,
  error: null,

  fetchTopology: async () => {
    try {
      set({ loading: true, error: null });
      const topology = await invoke<CpuTopology>('get_cpu_topology');
      set({ cpuTopology: topology, loading: false });
    } catch (e) {
      set({ error: e as string, loading: false });
    }
  },

  fetchAllocation: async (serverId: number) => {
    try {
      set({ loading: true, error: null });
      const allocation = await invoke<HardwareAllocation>('get_hardware_allocation', { serverId });
      set((state) => ({
        allocations: {
          ...state.allocations,
          [serverId]: allocation,
        },
        loading: false,
      }));
    } catch (e) {
      set({ error: e as string, loading: false });
    }
  },

  saveAllocation: async (allocation: HardwareAllocation) => {
    try {
      set({ loading: true, error: null });
      await invoke('save_hardware_allocation', { allocation });
      set((state) => ({
        allocations: {
          ...state.allocations,
          [allocation.serverId]: allocation,
        },
        loading: false,
      }));
    } catch (e) {
      set({ error: e as string, loading: false });
      throw e;
    }
  },
}));
