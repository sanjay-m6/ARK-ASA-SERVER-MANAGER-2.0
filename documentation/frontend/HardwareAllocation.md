# ⚙️ Hardware Allocation

The Hardware Allocation page is a mission-critical performance utility that allows you to micro-manage how system resources are distributed across your server cluster, ensuring maximum stability and minimum latency.

## 📝 Page Overview
- **Route**: `/hardware`
- **Purpose**: CPU affinity binding, process priority management, and resource contention prevention.
- **Aesthetic**: Technical "Blue & Slate" interface with interactive topology grids and precision controls.

## 🚀 Key Modules

### 1. CPU Affinity Orchestrator (🧠)
Take direct control over the host's processor architecture:
- **Topology Awareness**: Automatically detects the total number of logical cores available on the host machine.
- **Precision Core Binding**: Assign specific server instances to designated CPU cores. This prevents multiple servers from competing for the same physical resource, which is the primary cause of "TPS lag" in high-population environments.
- **Isolation Logic**: Easily reserve specific cores for the operating system while pinning game processes to dedicated performance cores.

### 2. Process Priority Tuner (⚡)
Optimize how the Windows kernel treats your game server threads:
- **Multi-Level Grading**: Select from `Idle`, `Normal`, `Above Normal`, `High`, and `RealTime` priority levels.
- **Performance Gating**: Elevating a server to `High` priority ensures it receives CPU cycles before background tasks, significantly reducing tick-rate jitter.
- **Safety Safeguards**: Integrated warnings regarding `RealTime` priority, which can potentially starve the host OS of resources if used incorrectly.

### 3. Visual Topology Grid
An interactive map of your system's processing power:
- **Real-Time Core Mapping**: A responsive grid representing every logical core in your system.
- **Visual Allocation**: Cores are color-coded and illuminated with a blue glow when assigned to the currently selected server.
- **Contention Prevention**: Visual feedback prevents you from accidentally leaving a server with zero assigned cores.

### 4. Cluster-Wide Resource Planning
- **Instance Isolation**: View and manage allocations for every server in your cluster from a single pane.
- **Persistence Layer**: Settings are saved directly to the instance configuration and applied automatically during the next server boot sequence.

## 🛠️ Interface Controls
- **Core Toggle**: Click individual cores in the grid to add or remove them from the server's affinity mask.
- **"Use All Cores" [Switch]**: Quickly revert to default OS-managed scheduling for a specific instance.
- **Priority Selector**: Dropdown menu for instant process weight adjustment.
- **Save Settings [Disk]**: Commit changes to the backend. (Note: Requires a server restart to take effect).

## 🎨 Design Notes
- **Blueprint Aesthetic**: Uses a darker slate theme with bright blue accents to convey a "low-level hardware" feel.
- **Interactive States**: Cores feature `zoom-on-hover` and `glow-on-select` animations using Tailwind transitions.
- **Status Badges**: High-contrast icons (Cpu, Server, Save) help navigate the complex configuration options.
