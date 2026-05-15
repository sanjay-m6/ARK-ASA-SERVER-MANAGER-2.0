# 🖥️ Hardware Allocation

The Hardware Allocation hub is the manager's low-level performance optimization center. It provides direct control over how your physical CPU resources are distributed across your server instances, ensuring maximum stability and minimizing lag caused by resource contention.

## 📝 Page Overview
- **Route**: `/hardware`
- **Purpose**: CPU core affinity mapping, OS-level process priority management, and hardware-level performance tuning.
- **Aesthetic**: Performance-driven "Technical Blue" interface featuring interactive core grids, split-panel selection, and high-contrast diagnostic indicators.

## 🚀 Key Modules

### 1. CPU Core Affinity Mapping (🧠)
Take total control of your processor's power:
- **Logical Topology Discovery**: The manager automatically scans your host system to identify every available logical core, providing a visual map of your compute architecture.
- **Granular Core Binding**: Assign specific CPU cores to individual server instances. By isolating each server to its own set of cores, you prevent "noisy neighbor" effects where one server's performance spikes impact others.
- **Os-Level Isolation**: Leave specific cores unassigned to ensure the host operating system and background management services always have dedicated resources for stable operation.

### 2. Process Priority Management (⚡)
Define your server's importance within the system:
- **Scheduling Priority Control**: Adjust how the Windows operating system prioritizes the server process relative to other running applications.
- **Performance Tiers**: Choose from multiple priority levels:
    - **Normal/Above Normal**: Balanced performance for standard servers.
    - **High**: Recommended for high-population dedicated servers to ensure consistent frame times.
    - **RealTime**: Extreme performance for specialized competitive environments (Note: Use with caution as this can impact OS responsiveness).
- **Contention Prevention**: Strategically set priorities to ensure that critical servers always receive CPU cycles before background tasks.

### 3. Per-Server Resource Profiles (📊)
Tailored performance for every map:
- **Independent Hardware Tuning**: Every server in your cluster can have its own unique hardware allocation profile. Assign more cores to resource-heavy maps like "The Island" while optimizing smaller instances for lower footprints.
- **Dynamic Profile Persistence**: The manager securely stores your affinity and priority settings, automatically applying them every time the server is launched.
- **Real-Time Topology Feedback**: The interactive core grid updates its state based on your selections, providing a clear visual representation of each server's active compute footprint.

### 4. Administrative Safety Controls (🛡️)
Protect your host system's stability:
- **Instability Warnings**: Built-in logic prevents you from accidentally assigning zero cores to a server and warns against dangerous priority levels that could freeze the host machine.
- **Restart Coordination**: Clear visual reminders inform you that hardware-level changes require a server restart to be applied by the operating system.
- **Error Diagnostics**: Integrated error reporting that surfaces hardware-related failures directly within the allocation panel.

## 🛠️ Interface Controls
- **Select Server [Server]**: Choose which instance you want to tune from your server list.
- **Process Priority [Dropdown]**: Select the OS-level scheduling importance.
- **Use All Cores [Checkbox]**: Quickly toggle between default OS management and custom affinity.
- **Core Selector [Grid]**: Click individual logical cores to bind them to the selected server.
- **Save Settings [Save]**: Commit your hardware profile to the configuration database.

## 🎨 Design Notes
- **Compute Aesthetic**: Uses cool blue gradients and high-contrast dark panels to represent the "Hardware/Compute" infrastructure layer.
- **Interactive Core Feedback**: Features vibrant glowing selection states for cores, providing an "Engineer's Console" feel.
- **Clean Split-Panel Layout**: Separates the navigation list from the complex configuration settings to ensure a focused administrative workflow.
