# PLAN: ARK Server Installation Validation, Hardware Diagnostics & Configuration Generator

This document outlines the detailed architectural blueprint, validation rules, path resolution strategies, and config file generation pipeline for the final step of the server installation. It ensures that all server configurations, hardware limits, and system variables are verified and automatically written to Evolved (ASE) and Ascended (ASA) server settings profiles safely.

---

## 1. Goal Description

When deploying a server, the manager must automatically:
1. **Extract Configurations**: Read server names, game/query/RCON ports, map configurations, player capacity, and RCON enablement parameters.
2. **Retrieve System Hardware Specs**: Query the host operating system, active network interface, MAC address, local IPv4, host CPU models/cores, RAM capacity, and free/total partition disk space (cross-platform).
3. **Validate Values & Flag Warnings**: Scan for invalid port ranges (e.g. privileged <1024), port collisions (same port mapped twice), extremely weak admin passwords, low disk space (<50GB), and insufficient host memory (<16GB).
4. **Auto-Generate & Safe Merge Configs**: Write fresh configurations or merge changes into `GameUserSettings.ini`, `Game.ini`, and `Engine.ini` for both `WindowsServer` and `LinuxServer` directory structures without corrupting custom options.
5. **Console Logging**: Print a clear, formatted visual summary directly to the installation console stream using a custom border layout.

---

## 2. User Review Required

Before beginning the final validation and execution run, we would like your feedback on the following strategic design parameters:

> [!IMPORTANT]
> **1. Disk Space Threshold Handling**
> Currently, the validator warns the user if available space on the target partition is `< 50GB` (to prevent installation failure and leave enough headroom for the server download, updates, and save files).
> - Should we enforce a **strict block (hard failure)** if it falls below 30GB to prevent system crash? Or keep it as a **soft warning** so the user has full discretion to proceed?
> 
> **2. Default Netcode Optimization in Engine.ini**
> The system generates high-performance netcode rates in `Engine.ini` by default (`MaxInternetClientRate=1048576`, `MaxClientRate=1048576`, `TickRate=30`).
> - Are these netcode optimization settings ideal for your ASA environment, or would you prefer a custom tick rate preset (e.g. 60Hz)?

---

## 3. Proposed Changes

The backend services for system specs and config merging have been successfully coded. This section maps out the modular files and integration hooks involved.

### Backend Rust Components

#### [NEW] [system_analyzer.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/services/system_analyzer.rs)
- Implements `get_system_specs` using the `sysinfo` crate to query hardware details (OS, CPU cores, RAM).
- Maps install path to target partition mount point to calculate available disk space.
- Binds a UDP socket to `8.8.8.8:80` temporarily to resolve the real local IPv4 address.
- Implements `validate_server_details` to return validation outcomes, errors, and warnings.

#### [MODIFY] [config_generator.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/services/config_generator.rs)
- Introduces `get_config_subdirectory(install_path)` to dynamically detect whether it is a `"LinuxServer"` or `"WindowsServer"` installation directory footprint.
- Introduces `generate_engine_ini()` to support netcode optimizations.
- Updates `write_configs` to back up, write, and safely merge (`IniParser::merge`) `GameUserSettings.ini`, `Game.ini`, and `Engine.ini` configurations.

#### [MODIFY] [server.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/commands/server.rs)
- Hooks validation inside `install_server`.
- Generates ASCII borders and logs hardware diagnostics + validation status directly to the `installer` console feed.

---

## 4. Verification Plan

We will perform comprehensive verification steps to ensure compilation reliability and perfect system behavior.

### Automated Verifications
1. **Rust Backend Compiler Check**:
   ```powershell
   cargo check --all
   ```
2. **Frontend Type Check**:
   ```bash
   npx tsc --noEmit
   ```
3. **Audit and Formatting Check**:
   Verify everything conforms to formatting standards:
   ```powershell
   python .agent/scripts/checklist.py .
   ```

### Manual Verification
- Deploy a mock server inside the app interface.
- Inspect the installation console feed to check the hardware specs table.
- Verify warning logs for port collisions or low disk space are printed clearly.
- Check that `GameUserSettings.ini`, `Game.ini`, and `Engine.ini` files are written successfully under `ShooterGame/Saved/Config/WindowsServer` (or `LinuxServer`) and that subsequent deploys merge cleanly without resetting manually customized settings.
