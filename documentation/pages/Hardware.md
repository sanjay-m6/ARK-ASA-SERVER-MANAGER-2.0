# 🖥️ Hardware Allocation Page

The Hardware Allocation page provides advanced resource management controls, allowing administrators to optimize server performance by pinning process affinity and setting system priorities.

## 📝 Component Overview
- **File Path**: `src/pages/Hardware.tsx`
- **Associated Store**: `useHardwareStore`
- **Features**: CPU Topology Discovery, Core Affinity Pinning, Process Priority Management.

## 🚀 Key Features

### 1. CPU Topology Discovery
- **Logical Core Detection**: Automatically identifies the total number of logical processors (threads) available on the host machine.
- **Visual Mapping**: Presents an interactive grid of available cores for easy selection.

### 2. Core Affinity Pinning (📍)
- **Granular Control**: Assign specific CPU cores to individual server instances. This prevents multiple servers from competing for the same physical resource, reducing lag and micro-stutters.
- **Contention Prevention**: Allows admins to isolate heavy servers (like a busy "The Island" map) from lighter servers.
- **Safety Defaults**: "Use All Cores" is enabled by default to ensure standard Windows load balancing unless manual tuning is required.

### 3. Process Priority Management
Administrators can set the execution priority for the server's Windows process:
- **Normal**: Default priority for most applications.
- **Above Normal / High**: Recommended for production servers to ensure the CPU prioritizes game logic over background tasks.
- **RealTime (⚠️ Warning)**: Not recommended for most users as it can starve the Operating System of essential resources, potentially causing system instability.

### 4. Per-Server Configuration
- **Isolation**: Hardware settings are stored and applied independently for every server in the cluster.
- **Persistence**: Settings are saved to the application database and applied automatically when the server process starts.

## 🛠️ Technical Details

### Backend Integration
The hardware store interacts with the backend to retrieve system information and apply process constraints:
```typescript
await saveAllocation({
  serverId: selectedServerId,
  useAllCores: localAllocation.use_all_cores,
  cpuAffinity: JSON.stringify(localAllocation.cpu_affinity),
  processPriority: localAllocation.process_priority,
});
```

### Application timing
Note: Hardware allocation changes require a **server restart** to take effect, as they are applied during the initial process spawning phase.

## 🎨 UI/UX Patterns
- **Interactive Core Grid**: Buttons in the core grid feature a "Glow" effect when selected, indicating an active resource assignment.
- **Contextual Warnings**: Displays warnings when selecting potentially dangerous priorities like "RealTime".
- **Dynamic Opacity**: Disables the core selection grid when "Use All Cores" is checked to prevent UI confusion.
