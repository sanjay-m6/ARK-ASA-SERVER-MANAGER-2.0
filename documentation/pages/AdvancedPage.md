# 🛠️ Advanced Configuration Page

The Advanced Configuration page is designed for power users who require granular control over server startup parameters and application resource management.

## 📝 Component Overview
- **File Path**: `src/pages/tools/AdvancedPage.tsx`
- **Associated Service**: `updateServerSettings`, `optimizeMemory`.
- **Features**: Custom Launch Args, Mod Map Presets, Application RAM Optimizer, Eco Mode.

## 🚀 Key Features

### 1. Custom Launch Arguments (🕹️)
- **Direct Injection**: Add any valid ARK: Survival Ascended command-line argument to the server's boot sequence.
- **Command Preview**: A real-time preview showing exactly how the arguments will be appended to the executable path.
- **Safety Warning**: Visual alerts reminding users that incorrect flags can prevent the server from initializing correctly.

### 2. Quick Presets (🔥)
- **Mod Map Integration**: Pre-configured arguments for popular community maps (e.g., Scorched Earth Reborn).
- **One-Click Application**: Automatically appends the necessary `-MapModID` and `-mods` flags without manual typing.

### 3. Performance Optimizer (⚡)
- **Memory Trimming**: Manually force the application to release unused RAM back to the operating system.
- **Application Priority**: Elevate the Server Manager process to "High Priority" within Windows to ensure it remains responsive even when the CPU is under heavy load from game servers.

### 4. Ultra Eco Mode (🍃)
- **Resource Conservation**: An aggressive optimization mode that targets a memory footprint of less than 50MB for the manager app.
- **Background Worker**: Silently manages resource reclamation in the background, ideal for low-spec hosting machines.

## 🛠️ Technical Details

### Argument Persistence
Launch arguments are stored in the `ServerConfig` table and are concatenated with the base command line during the `start_server` process.

### Memory Optimization Logic
Uses Tauri's backend capabilities to invoke Windows-specific memory management APIs (`EmptyWorkingSet` or similar).
```typescript
await optimizeMemory();
```

## 🎨 UI/UX Patterns
- **High-Alert Theme**: Uses a "Red to Orange" gradient to signal the "Advanced" and potentially destructive nature of these settings.
- **Monospaced Inputs**: Custom arguments use a monospaced font to match terminal/INI standards.
- **Dashboard Cards**: Performance tools are organized into cards with distinct icons (Zap, Leaf, Activity) for quick identification.
