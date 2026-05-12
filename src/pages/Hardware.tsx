import React, { useEffect, useState } from 'react';
import { useHardwareStore } from '../stores/hardwareStore';
import { useServerStore } from '../stores/serverStore';
import { Cpu, Server, Save, AlertTriangle } from 'lucide-react';

const Hardware: React.FC = () => {
  const { servers, refreshServers } = useServerStore();
  const { cpuTopology, allocations, fetchTopology, fetchAllocation, saveAllocation, loading, error } = useHardwareStore();
  
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [localAllocation, setLocalAllocation] = useState<{
    use_all_cores: boolean;
    cpu_affinity: number[];
    process_priority: string;
  }>({
    use_all_cores: true,
    cpu_affinity: [],
    process_priority: 'Normal',
  });

  useEffect(() => {
    refreshServers();
    fetchTopology();
  }, [refreshServers, fetchTopology]);

  useEffect(() => {
    if (selectedServerId) {
      fetchAllocation(selectedServerId);
    }
  }, [selectedServerId, fetchAllocation]);

  useEffect(() => {
    if (selectedServerId && allocations[selectedServerId]) {
      const alloc = allocations[selectedServerId];
      setLocalAllocation({
        use_all_cores: alloc.useAllCores,
        cpu_affinity: JSON.parse(alloc.cpuAffinity || '[]'),
        process_priority: alloc.processPriority,
      });
    }
  }, [allocations, selectedServerId]);

  const handleToggleCore = (coreIndex: number) => {
    if (localAllocation.use_all_cores) return; // Cannot toggle if using all cores
    
    setLocalAllocation(prev => {
      const newAffinity = prev.cpu_affinity.includes(coreIndex)
        ? prev.cpu_affinity.filter(c => c !== coreIndex)
        : [...prev.cpu_affinity, coreIndex].sort((a, b) => a - b);
      return { ...prev, cpu_affinity: newAffinity };
    });
  };

  const handleSave = async () => {
    if (!selectedServerId) return;
    
    if (!localAllocation.use_all_cores && localAllocation.cpu_affinity.length === 0) {
      alert("You must select at least one core if not using all cores.");
      return;
    }

    await saveAllocation({
      serverId: selectedServerId,
      useAllCores: localAllocation.use_all_cores,
      cpuAffinity: JSON.stringify(localAllocation.cpu_affinity),
      processPriority: localAllocation.process_priority,
    });
    alert("Hardware allocation saved. Requires server restart to apply.");
  };

  const priorities = [
    { value: 'Idle', label: 'Idle (Low)' },
    { value: 'BelowNormal', label: 'Below Normal' },
    { value: 'Normal', label: 'Normal' },
    { value: 'AboveNormal', label: 'Above Normal' },
    { value: 'High', label: 'High' },
    { value: 'RealTime', label: 'RealTime (Dangerous)' },
  ];

  return (
    <div className="p-6 h-full flex flex-col bg-gray-900 text-white">
      <div className="flex items-center mb-6">
        <Cpu className="w-8 h-8 text-blue-400 mr-3" />
        <h1 className="text-3xl font-bold text-gray-100">Hardware Allocation</h1>
      </div>
      
      <p className="text-gray-400 mb-6 max-w-3xl">
        Manage CPU core affinity and process priority for your ASA cluster instances to prevent resource contention.
        Assigning specific cores to individual servers can significantly improve performance and stability.
      </p>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg mb-6 flex items-center">
          <AlertTriangle className="w-5 h-5 mr-3" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Selection Panel */}
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-5 flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Server className="w-5 h-5 mr-2 text-blue-400" />
            Select Server
          </h2>
          
          <div className="space-y-2 overflow-y-auto flex-1">
            {servers.length === 0 ? (
              <p className="text-gray-500 italic">No servers configured.</p>
            ) : (
              servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => setSelectedServerId(server.id)}
                  className={`w-full text-left p-3 rounded-md transition-colors border ${
                    selectedServerId === server.id 
                      ? 'bg-blue-600/20 border-blue-500 text-blue-100' 
                      : 'bg-gray-750 border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{server.name}</div>
                  <div className="text-xs text-gray-500">{server.config?.mapName || 'Unknown Map'} • Port {server.ports.gamePort}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-5 flex flex-col">
          {!selectedServerId ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a server to configure its hardware allocation
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Allocation Settings</h2>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

              {/* Priority */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">Process Priority</label>
                <select
                  value={localAllocation.process_priority}
                  onChange={(e) => setLocalAllocation(prev => ({ ...prev, process_priority: e.target.value }))}
                  className="w-full lg:w-1/2 bg-gray-900 border border-gray-600 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {priorities.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Above Normal or High is recommended for dedicated servers. RealTime can freeze your OS.
                </p>
              </div>

              {/* Core Affinity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-400">CPU Core Affinity</label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localAllocation.use_all_cores}
                      onChange={(e) => setLocalAllocation(prev => ({ ...prev, use_all_cores: e.target.checked }))}
                      className="form-checkbox h-4 w-4 text-blue-500 rounded border-gray-600 bg-gray-900 focus:ring-blue-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-gray-300">Use All Cores (Default)</span>
                  </label>
                </div>
                
                <p className="text-xs text-gray-500 mb-4">
                  Select which logical cores this server instance is allowed to run on. 
                  Leave at least 1-2 cores free for the host OS and other services.
                </p>

                {cpuTopology ? (
                  <div className={`grid grid-cols-4 sm:grid-cols-8 gap-2 p-4 bg-gray-900 rounded-lg border border-gray-700 ${localAllocation.use_all_cores ? 'opacity-50 pointer-events-none' : ''}`}>
                    {Array.from({ length: cpuTopology.logical_cores }).map((_, i) => {
                      const isSelected = localAllocation.cpu_affinity.includes(i) || localAllocation.use_all_cores;
                      return (
                        <button
                          key={i}
                          onClick={() => handleToggleCore(i)}
                          disabled={localAllocation.use_all_cores}
                          className={`py-3 rounded-md text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)] border border-blue-400'
                              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:border-gray-500'
                          }`}
                        >
                          Core {i}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 text-center text-gray-500">
                    Loading CPU topology...
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Hardware;
