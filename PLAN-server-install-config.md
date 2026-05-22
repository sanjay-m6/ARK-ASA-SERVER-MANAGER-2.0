# PLAN: ARK Server Install Details, System Information & Configuration System

This plan details the technical roadmap for implementing an advanced extraction, validation, and auto-configuration system during the final server installation step. The system will extract server configurations, read system hardware, validate constraints, and write clean, cross-platform configuration files (`GameUserSettings.ini`, `Game.ini`, and `Engine.ini`) for both Windows and Linux environments.

## Project Type
- **WEB** (React, TypeScript, Tauri Rust Backend)

---

## Success Criteria
1. **Complete Details Extraction**: Captures server name, session name, maps, ports, player count, passwords, and custom args during installation.
2. **Cross-Platform System Detection**: Uses `sysinfo` to extract precise OS name, CPU model, total/free RAM, and available disk space on the specific partition hosting the installation.
3. **Network & Adapter Mapping**: Retrieves active network interface names, MAC addresses, and local IPv4 addresses.
4. **Strict Safety Validation**: Validates ports for range limits and collisions, passwords for security criteria, and disk space availability (minimum 50GB).
5. **Robust Merge & Resolution**: Writes or merges configuration into `GameUserSettings.ini`, `Game.ini`, and `Engine.ini` under `ShooterGame/Saved/Config/WindowsServer` or `LinuxServer` without corrupting pre-existing custom parameters.
6. **Detailed Audit Logging**: Outputs a comprehensive visual log showing extracted values, system parameters, and validation checks.

---

## Tech Stack
- **Backend**: Rust, Tauri, `sysinfo`, `ini` parser/writer, SQLite (database state)
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons

---

## User Review Required & Socratic Gate

Before beginning execution, we need your feedback on the following design choices and edge cases:

> [!IMPORTANT]
> **1. Target Server OS Mode vs Runtime OS**:
> For Linux path resolution (`LinuxServer` vs `WindowsServer`), should we auto-detect based on the running host's operating system, or should the backend support cross-platform path resolution based on the `server_type` or a chosen target OS (allowing Windows managers to prepare Linux-compatible installations)?
> 
> **2. Hard Abort vs soft Warning for Low Disk Space**:
> If the destination partition has less than the required space (e.g. 50GB for ASA), should the validation fail hard (stopping the installation) or log a warning and allow the user to proceed anyway?
> 
> **3. Engine.ini Specifications**:
> What default parameters should be written to `Engine.ini` if it is generated? For instance, custom netcode optimizations (`IpNetDriver`, `MaxInternetClientRate`), tick rates, or resource pooling configurations?

---

## Proposed File Changes

### [Backend Components]

#### [NEW] [system_analyzer.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/services/system_analyzer.rs)
A dedicated service file handling hardware parameters, disk space checks for the specific installation folder, active network adapter detection, and port collision verification.

#### [MODIFY] [config_generator.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/services/config_generator.rs)
- Update `write_configs` and path resolvers to dynamically support `LinuxServer` and `WindowsServer` subdirectories.
- Add support for generating/merging default `Engine.ini` optimization profiles.

#### [MODIFY] [server.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/commands/server.rs)
- Update the Tauri `install_server` command to trigger the validation pipeline before writing the ini configs.
- Output detailed system and validation logs directly to the installation console process stream.

---

## Proposed Tasks & Task Breakdown

### Phase 1: System Info & Network Adapter Extraction
- **Task ID**: `INSTALL-SYS-01`
- **Name**: Build System Hardware & Adapter Analyzer
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`, `api-patterns`
- **Priority**: High
- **Dependencies**: None
- **Description**: Create `src-tauri/src/services/system_analyzer.rs` and implement `get_system_specs` to extract:
  - OS Name and Version
  - CPU Brand and Cores count
  - Total Memory (RAM) in GB
  - Active network adapter interface name and MAC address
  - Local IPv4 address
- **INPUT**: `sysinfo` crate APIs and network sockets.
- **OUTPUT**: `SystemHardwareSpecs` struct containing all physical specs.
- **VERIFY**: Unit tests check system properties are read correctly.

- **Task ID**: `INSTALL-SYS-02`
- **Name**: Build Specific Drive Disk Space Calculator
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **Priority**: High
- **Dependencies**: `INSTALL-SYS-01`
- **Description**: Implement path-specific disk space detection in `system_analyzer.rs`. Map the installation `PathBuf` to its parent partition and fetch the available free space.
- **INPUT**: Install directory path.
- **OUTPUT**: Free space in GB on that specific drive partition.
- **VERIFY**: Compare space output against local drive reports.

### Phase 2: Configuration Validation Pipeline
- **Task ID**: `INSTALL-VALIDATE-01`
- **Name**: Implement Server Settings & Ports Validator
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **Priority**: High
- **Dependencies**: `INSTALL-SYS-02`
- **Description**: Implement `validate_server_details` in `system_analyzer.rs`. Ensure:
  - Game/Query/RCON ports are valid (1-65535) and don't collide.
  - Admin password is not empty and meets basic complexity.
  - Disk space is checked against a 50GB requirement threshold.
  - Map name matches standard map names.
- **INPUT**: `ServerConfig` and `SystemHardwareSpecs` models.
- **OUTPUT**: `ValidationResult` containing success status and list of errors/warnings.
- **VERIFY**: Test with invalid ports and low disk mock data to trigger errors.

### Phase 3: Path Resolution & Engine.ini Integration
- **Task ID**: `INSTALL-INI-01`
- **Name**: Update Config Generator for Linux/Windows & Engine.ini
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **Priority**: High
- **Dependencies**: `INSTALL-VALIDATE-01`
- **Description**: Refactor `write_configs` inside `src-tauri/src/services/config_generator.rs` to:
  - Determine environment target (e.g. detect Linux platform or check for existing files to write to `LinuxServer` vs `WindowsServer`).
  - Add `Engine.ini` writer with default parameters or merge logic.
- **INPUT**: `config_generator.rs` write pipeline.
- **OUTPUT**: Cross-platform file path resolution and `Engine.ini` support.
- **VERIFY**: Verify both `WindowsServer` and `LinuxServer` resolve properly.

### Phase 4: Installation Hook & Visual Console Logs
- **Task ID**: `INSTALL-HOOK-01`
- **Name**: Hook Validation System into Server Install Command
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **Priority**: High
- **Dependencies**: `INSTALL-INI-01`
- **Description**: Modify the `install_server` Tauri command in `server.rs` to run the validation check at the final installation stage. Emit success/validation results, adapter specs, and configuration logs using `self.emit_console` or standard logs.
- **INPUT**: `install_server` command.
- **OUTPUT**: Complete server installation validation output logs.
- **VERIFY**: Build the project and trigger server installation; verify details are logged.

---

## Phase X: Final Verification

### Automated Verifications
1. **Type Checking**:
   ```bash
   npx tsc --noEmit
   ```
2. **Rust Compilation**:
   ```bash
   cargo check --all
   ```
3. **Execution check**:
   ```bash
   python .agent/scripts/verify_all.py .
   ```

### Rule Compliance (Manual Checklist)
- [ ] No purple/violet color formats added in custom displays.
- [ ] Log outputs are highly readable and formatted clean.
- [ ] Merge preserves all existing key-value details in pre-existing `.ini` files.
