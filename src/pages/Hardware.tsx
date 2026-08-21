import React, { useEffect, useState, useMemo } from 'react';
import { useHardwareStore } from '../stores/hardwareStore';
import { useServerStore } from '../stores/serverStore';
import {
  Cpu,
  Server,
  Save,
  AlertTriangle,
  Zap,
  Shield,
  Layers,
  Activity,
  Check,
  Copy,
  Sliders,
  Sparkles,
  RefreshCw,
  Radio
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Hardware: React.FC = () => {
  const { servers, refreshServers } = useServerStore();
  const { cpuTopology, allocations, fetchTopology, fetchAllocation, saveAllocation, loading, error } = useHardwareStore();

  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [copiedMask, setCopiedMask] = useState(false);
  const [showRealTimeWarning, setShowRealTimeWarning] = useState(false);
  const [pendingPriority, setPendingPriority] = useState<string | null>(null);

  const [localAllocation, setLocalAllocation] = useState<{
    use_all_cores: boolean;
    cpu_affinity: number[];
    process_priority: string;
  }>({
    use_all_cores: true,
    cpu_affinity: [],
    process_priority: 'Normal',
  });

  // Load initial topology and servers
  useEffect(() => {
    refreshServers();
    fetchTopology();
  }, [refreshServers, fetchTopology]);

  // Fetch allocation for all servers to detect cluster core overlap
  useEffect(() => {
    if (servers.length > 0) {
      servers.forEach((s) => fetchAllocation(s.id));
      if (selectedServerId === null) {
        setSelectedServerId(servers[0].id);
      }
    }
  }, [servers, fetchAllocation, selectedServerId]);

  const totalCores = cpuTopology?.logical_cores || 8;
  const physicalCores = cpuTopology?.physical_cores || totalCores / 2;

  // Sync local state when selected server or allocations update
  useEffect(() => {
    if (selectedServerId && allocations[selectedServerId]) {
      const alloc = allocations[selectedServerId];
      let parsedAffinity: number[] = [];
      try {
        parsedAffinity = JSON.parse(alloc.cpuAffinity || '[]');
      } catch {
        parsedAffinity = [];
      }
      if (parsedAffinity.length === 0) {
        parsedAffinity = Array.from({ length: totalCores }, (_, i) => i);
      }
      setLocalAllocation({
        use_all_cores: alloc.useAllCores,
        cpu_affinity: parsedAffinity,
        process_priority: alloc.processPriority || 'Normal',
      });
    }
  }, [allocations, selectedServerId, totalCores]);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId),
    [servers, selectedServerId]
  );

  // Toggle individual core
  const handleToggleCore = (coreIndex: number) => {
    if (localAllocation.use_all_cores) return;

    setLocalAllocation((prev) => {
      const exists = prev.cpu_affinity.includes(coreIndex);
      const newAffinity = exists
        ? prev.cpu_affinity.filter((c) => c !== coreIndex)
        : [...prev.cpu_affinity, coreIndex].sort((a, b) => a - b);
      return { ...prev, cpu_affinity: newAffinity };
    });
  };

  // Presets
  const applyPreset = (presetType: 'all' | 'even' | 'odd' | 'skip_os' | 'first_half' | 'second_half' | 'none') => {
    if (presetType === 'all') {
      setLocalAllocation((prev) => ({
        ...prev,
        use_all_cores: true,
        cpu_affinity: Array.from({ length: totalCores }, (_, i) => i),
      }));
      toast.success('Assigned all logical CPU cores');
      return;
    }

    let selected: number[] = [];
    switch (presetType) {
      case 'even':
        // Even indices represent primary physical cores on HT systems
        selected = Array.from({ length: totalCores }, (_, i) => i).filter((i) => i % 2 === 0);
        break;
      case 'odd':
        // Odd indices represent hyperthreaded secondary cores
        selected = Array.from({ length: totalCores }, (_, i) => i).filter((i) => i % 2 !== 0);
        break;
      case 'skip_os':
        // Skip Core 0 and Core 1 (keep free for host OS & background workers)
        selected = Array.from({ length: totalCores }, (_, i) => i).filter((i) => i >= 2);
        break;
      case 'first_half':
        selected = Array.from({ length: Math.ceil(totalCores / 2) }, (_, i) => i);
        break;
      case 'second_half':
        selected = Array.from({ length: Math.floor(totalCores / 2) }, (_, i) => i + Math.ceil(totalCores / 2));
        break;
      case 'none':
        selected = [];
        break;
    }

    setLocalAllocation((prev) => ({
      ...prev,
      use_all_cores: false,
      cpu_affinity: selected,
    }));
  };

  // Calculate Bitmask & Hex Affinity
  const affinityMaskHex = useMemo(() => {
    if (localAllocation.use_all_cores || localAllocation.cpu_affinity.length === 0) {
      // Full mask for all cores
      const fullMask = (BigInt(1) << BigInt(totalCores)) - BigInt(1);
      return `0x${fullMask.toString(16).toUpperCase().padStart(8, '0')}`;
    }
    let mask = BigInt(0);
    localAllocation.cpu_affinity.forEach((core) => {
      mask |= BigInt(1) << BigInt(core);
    });
    return `0x${mask.toString(16).toUpperCase().padStart(8, '0')}`;
  }, [localAllocation, totalCores]);

  // Compute other servers assigned to each core
  const coreUsageMap = useMemo(() => {
    const map: Record<number, string[]> = {};
    servers.forEach((srv) => {
      if (srv.id === selectedServerId) return;
      const alloc = allocations[srv.id];
      if (!alloc) return;
      if (alloc.useAllCores) {
        for (let i = 0; i < totalCores; i++) {
          if (!map[i]) map[i] = [];
          map[i].push(srv.name);
        }
      } else {
        try {
          const cores: number[] = JSON.parse(alloc.cpuAffinity || '[]');
          cores.forEach((c) => {
            if (!map[c]) map[c] = [];
            map[c].push(srv.name);
          });
        } catch {
          // ignore
        }
      }
    });
    return map;
  }, [servers, selectedServerId, allocations, totalCores]);

  // Handle Priority Selection
  const handleSelectPriority = (priorityVal: string) => {
    if (priorityVal === 'RealTime') {
      setPendingPriority(priorityVal);
      setShowRealTimeWarning(true);
    } else {
      setLocalAllocation((prev) => ({ ...prev, process_priority: priorityVal }));
    }
  };

  const confirmRealTimePriority = () => {
    if (pendingPriority) {
      setLocalAllocation((prev) => ({ ...prev, process_priority: pendingPriority }));
    }
    setShowRealTimeWarning(false);
    setPendingPriority(null);
  };

  const handleSave = async () => {
    if (!selectedServerId) {
      toast.error('Please select a server first');
      return;
    }

    let finalUseAllCores = localAllocation.use_all_cores;
    let finalAffinity = localAllocation.cpu_affinity;

    // Auto-fallback: if no cores selected when saving, revert to all cores to ensure process can execute
    if (!finalUseAllCores && finalAffinity.length === 0) {
      finalUseAllCores = true;
      finalAffinity = Array.from({ length: totalCores }, (_, i) => i);
      setLocalAllocation((prev) => ({
        ...prev,
        use_all_cores: true,
        cpu_affinity: finalAffinity,
      }));
    }

    try {
      await saveAllocation({
        serverId: selectedServerId,
        useAllCores: finalUseAllCores,
        cpuAffinity: JSON.stringify(finalAffinity),
        processPriority: localAllocation.process_priority,
      });
      toast.success('Hardware allocation settings saved successfully!', {
        icon: '⚡',
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          border: '1px solid #3b82f6',
        },
      });
    } catch (e) {
      toast.error(`Failed to save: ${String(e)}`);
    }
  };

  const copyMaskToClipboard = () => {
    navigator.clipboard.writeText(affinityMaskHex);
    setCopiedMask(true);
    toast.success(`Copied Affinity Mask (${affinityMaskHex}) to clipboard`);
    setTimeout(() => setCopiedMask(false), 2000);
  };

  const priorities = [
    {
      value: 'Idle',
      label: 'Idle',
      desc: 'Lowest priority. Only receives CPU time when system is idle.',
      badgeBg: 'bg-gray-800 text-gray-400 border-gray-700',
    },
    {
      value: 'BelowNormal',
      label: 'Below Normal',
      desc: 'Slightly reduced priority for background support services.',
      badgeBg: 'bg-slate-800 text-slate-300 border-slate-600',
    },
    {
      value: 'Normal',
      label: 'Normal',
      desc: 'Standard Windows process priority balance.',
      badgeBg: 'bg-blue-900/40 text-blue-300 border-blue-600/40',
    },
    {
      value: 'AboveNormal',
      label: 'Above Normal',
      desc: 'Ensures process priority over standard desktop applications.',
      badgeBg: 'bg-cyan-900/40 text-cyan-300 border-cyan-500/40',
    },
    {
      value: 'High',
      label: 'High (Recommended)',
      desc: 'Top priority for dedicated game servers. Prevents frame stutter.',
      badgeBg: 'bg-indigo-900/50 text-indigo-200 border-indigo-500/50',
    },
    {
      value: 'RealTime',
      label: 'RealTime ⚠️',
      desc: 'Highest possible execution priority. May lock host OS if overloaded.',
      badgeBg: 'bg-rose-950/60 text-rose-300 border-rose-600/60',
    },
  ];

  const activeCoresCount = localAllocation.use_all_cores
    ? totalCores
    : localAllocation.cpu_affinity.length;

  return (
    <div className="p-6 min-h-screen bg-transparent text-[var(--text-primary)] flex flex-col gap-6">
      {/* Top Telemetry Header */}
      <div className="relative overflow-hidden rounded-2xl glass-panel border border-[var(--border)] p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Cpu className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Hardware & CPU Allocation
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sparkles className="w-3.5 h-3.5" /> High Performance Engine
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                Optimize process priorities and isolate specific physical/logical CPU cores per ARK server instance to eliminate micro-stuttering and core contention.
              </p>
            </div>
          </div>

          {/* Quick Hardware Stats Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-inner">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] font-medium">Logical Cores</div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{totalCores} Threads</div>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-inner">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] font-medium">Physical Cores</div>
                <div className="text-lg font-bold text-emerald-400">{physicalCores} Cores</div>
              </div>
            </div>

            <button
              onClick={() => {
                refreshServers();
                fetchTopology();
                if (selectedServerId) fetchAllocation(selectedServerId);
                toast.success('Refreshed hardware status');
              }}
              className="p-3 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-4 rounded-xl flex items-center gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <div className="text-sm font-medium">{error}</div>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Server Selector Panel */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel rounded-2xl border border-[var(--border)] p-5 shadow-xl flex flex-col flex-1">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <Server className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-wide">Cluster Instances</h2>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]">
                {servers.length} Servers
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto flex-1 max-h-[600px] pr-1 custom-scrollbar">
              {servers.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl">
                  <Server className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-[var(--text-muted)]">No servers configured in ARK Manager.</p>
                </div>
              ) : (
                servers.map((server) => {
                  const isSelected = selectedServerId === server.id;
                  const alloc = allocations[server.id];
                  let serverCoresCount = totalCores;
                  if (alloc && !alloc.useAllCores) {
                    try {
                      serverCoresCount = JSON.parse(alloc.cpuAffinity || '[]').length;
                    } catch {
                      serverCoresCount = 0;
                    }
                  }

                  const isOnline = server.status === 'online' || server.status === 'running';

                  return (
                    <button
                      key={server.id}
                      onClick={() => setSelectedServerId(server.id)}
                      className={`w-full text-left p-4 rounded-xl transition-all duration-200 border relative group overflow-hidden cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-900/30 via-slate-900 to-slate-900 border-blue-500/60 shadow-lg shadow-blue-500/10 text-white'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-l-xl" />
                      )}

                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="font-bold text-sm tracking-wide text-[var(--text-primary)] group-hover:text-cyan-400 transition-colors">
                          {server.name}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-400'
                            }`}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            {server.status || 'Offline'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mt-2 pt-2 border-t border-[var(--border)]">
                        <span className="truncate max-w-[140px] text-[var(--text-muted)]">
                          {server.config?.mapName || 'ASA Server'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-hover)] border border-[var(--border)] text-cyan-400 text-[11px] font-mono font-semibold">
                          <Cpu className="w-3 h-3 text-cyan-400" />
                          {alloc?.useAllCores ? 'All Cores' : `${serverCoresCount} Cores`}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Configuration & Core Affinity Matrix */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {!selectedServerId ? (
            <div className="glass-panel rounded-2xl border border-[var(--border)] p-12 text-center flex flex-col items-center justify-center flex-1 shadow-xl">
              <div className="p-4 rounded-2xl bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] mb-4">
                <Sliders className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">No Instance Selected</h3>
              <p className="text-[var(--text-secondary)] text-sm max-w-sm">
                Select an ARK server instance from the cluster list on the left to configure CPU core affinity and process priority settings.
              </p>
            </div>
          ) : (
            <>
              {/* Header & Save Action Panel */}
              <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
                    <Radio className="w-3.5 h-3.5" /> Instance Hardware Profile
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    {selectedServer?.name}
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]">
                      ID: {selectedServerId}
                    </span>
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {loading ? 'Saving...' : 'Apply & Save Settings'}
                  </button>
                </div>
              </div>

              {/* Core Affinity Visual Matrix Section */}
              <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl flex flex-col gap-6">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-cyan-400" />
                        CPU Core Affinity Matrix
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Select which logical processors this server process can execute on.
                      </p>
                    </div>

                    {/* Toggle Use All Cores */}
                    <label className="flex items-center gap-3 cursor-pointer bg-[var(--surface-hover)] border border-[var(--border)] px-4 py-2 rounded-xl hover:border-[var(--border-hover)] transition-colors shadow-inner">
                      <input
                        type="checkbox"
                        checked={localAllocation.use_all_cores}
                        onChange={(e) =>
                          setLocalAllocation((prev) => {
                            const isChecked = e.target.checked;
                            let newAffinity = prev.cpu_affinity;
                            if (isChecked) {
                              newAffinity = Array.from({ length: totalCores }, (_, i) => i);
                            } else if (newAffinity.length === 0) {
                              newAffinity = Array.from({ length: totalCores }, (_, i) => i);
                            }
                            return {
                              ...prev,
                              use_all_cores: isChecked,
                              cpu_affinity: newAffinity,
                            };
                          })
                        }
                        className="w-4 h-4 text-cyan-500 rounded border-[var(--border)] bg-[var(--surface)] focus:ring-cyan-500"
                      />
                      <div className="text-xs font-bold text-[var(--text-primary)]">Use All Cores (Default)</div>
                    </label>
                  </div>

                  {/* Affinity Presets Toolbar */}
                  <div className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl p-3 mb-6 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)] mr-1 flex items-center gap-1">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Presets:
                    </span>
                    <button
                      onClick={() => applyPreset('all')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      ⚡ All Cores
                    </button>
                    <button
                      onClick={() => applyPreset('even')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      🎯 Physical Cores (Even)
                    </button>
                    <button
                      onClick={() => applyPreset('odd')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      🔀 Hyperthreads (Odd)
                    </button>
                    <button
                      onClick={() => applyPreset('skip_os')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      🛡️ Reserve Cores 0-1 for OS
                    </button>
                    <button
                      onClick={() => applyPreset('first_half')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      🌓 First Half (0-{Math.ceil(totalCores / 2) - 1})
                    </button>
                    <button
                      onClick={() => applyPreset('second_half')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] border border-[var(--border)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      🌗 Second Half ({Math.ceil(totalCores / 2)}-{totalCores - 1})
                    </button>
                    <button
                      onClick={() => applyPreset('none')}
                      disabled={localAllocation.use_all_cores}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border)] hover:border-rose-500/40 transition-all disabled:opacity-40 ml-auto cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>

                  {/* Core Grid Visualizer */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-3.5 p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] transition-opacity duration-300 ${
                      localAllocation.use_all_cores ? 'opacity-70' : ''
                    }`}
                  >
                    {Array.from({ length: totalCores }).map((_, i) => {
                      const isSelected =
                        localAllocation.use_all_cores ||
                        localAllocation.cpu_affinity.includes(i);
                      const isPhysicalPrimary = i % 2 === 0;
                      const activeOtherServers = coreUsageMap[i] || [];

                      return (
                        <button
                          key={i}
                          onClick={() => handleToggleCore(i)}
                          disabled={localAllocation.use_all_cores}
                          className={`relative group p-3.5 rounded-xl border text-center transition-all duration-200 flex flex-col items-center justify-between min-h-[100px] min-w-[105px] ${
                            isSelected
                              ? 'bg-gradient-to-b from-blue-900/40 to-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] text-white'
                              : 'bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-active)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
                          } ${localAllocation.use_all_cores ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                        >
                          {/* Core Tag */}
                          <div className="flex items-center justify-between w-full text-[10px] font-mono text-[var(--text-muted)] mb-1 gap-1">
                            <span className="font-bold text-[var(--text-primary)] shrink-0">#{i}</span>
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] whitespace-nowrap shrink-0">
                              {isPhysicalPrimary ? 'P-CORE' : 'HT'}
                            </span>
                          </div>

                          {/* Core Icon & Status */}
                          <div className="my-1">
                            <Cpu
                              className={`w-6 h-6 transition-transform group-hover:scale-110 ${
                                isSelected ? 'text-cyan-400 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-[var(--text-muted)]'
                              }`}
                            />
                          </div>

                          <div className="text-xs font-bold tracking-wider mt-1 whitespace-nowrap">
                            Core {i}
                          </div>

                          {/* Conflict / Cluster Usage Badge */}
                          {activeOtherServers.length > 0 && (
                            <div
                              className="mt-1.5 w-full text-[10px] font-medium whitespace-nowrap text-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono tracking-tight"
                              title={`Used by: ${activeOtherServers.join(', ')}`}
                            >
                              Shared ({activeOtherServers.length})
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Affinity Telemetry & Hex Bitmask Bar */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-900/30 border border-blue-600/30 text-blue-400">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-muted)]">Selected Allocation Capacity</div>
                      <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        {activeCoresCount} of {totalCores} Logical Cores Assigned
                        <span className="text-xs font-normal text-[var(--text-secondary)] font-mono">
                          ({Math.round((activeCoresCount / totalCores) * 100)}% CPU Capacity)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hex Mask Display */}
                  <div className="flex items-center gap-3 bg-[var(--surface-hover)] border border-[var(--border)] px-4 py-2 rounded-xl">
                    <div className="text-xs font-semibold text-[var(--text-secondary)] font-mono">Affinity Mask:</div>
                    <code className="text-sm font-bold text-cyan-400 font-mono tracking-wider">
                      {affinityMaskHex}
                    </code>
                    <button
                      onClick={copyMaskToClipboard}
                      className="p-1.5 bg-[var(--surface)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors border border-[var(--border)] cursor-pointer"
                      title="Copy Hex Mask"
                    >
                      {copiedMask ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Process Priority Selection Grid */}
              <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-400" />
                    Process Priority Level
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Configure process scheduling priority in Windows Task Scheduler for this server binary.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {priorities.map((p) => {
                    const isSelected = localAllocation.process_priority === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => handleSelectPriority(p.value)}
                        className={`text-left p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--surface-hover)] border-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500'
                            : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md border ${p.badgeBg}`}
                          >
                            {p.label}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-indigo-400 font-bold" />}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RealTime Priority Warning Modal */}
      {showRealTimeWarning && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-600/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-950/60 border border-rose-600/40 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Caution: RealTime Priority</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Setting a process priority to <strong className="text-rose-400">RealTime</strong> forces Windows to execute server threads ahead of system drivers, keyboard/mouse input, and operating system kernels.
            </p>
            <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
              If the ARK server experiences heavy CPU load, your operating system may freeze or stop responding to remote desktop input. High priority is usually recommended instead.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowRealTimeWarning(false);
                  setPendingPriority(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRealTimePriority}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors shadow-lg shadow-rose-600/30"
              >
                I Understand, Enable RealTime
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Hardware;
