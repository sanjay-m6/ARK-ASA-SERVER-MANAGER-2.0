# 🛡️ Backup Manager

The Backup Manager is a professional-grade disaster recovery suite that provides both local and cloud-based data protection for ARK: Survival Ascended server instances.

## 📝 Page Overview
- **Route**: `/backups`
- **Purpose**: Data redundancy, point-in-time restoration, and storage optimization.
- **Aesthetic**: Data-rich interface with dual-view modes (Timeline/List) and amber-accented "Safe Harbor" visual cues.

## 🚀 Key Modules

### 1. Dual-Tier Storage Architecture (☁️)
Flexible storage options to ensure data is never lost, even in the event of hardware failure:
- **Local Storage**: High-speed, on-disk backups stored in compressed archives on the host machine.
- **Cloud Archive**: Integrated off-site storage (AWS S3/Azure compatible) for professional-level disaster recovery, managed through a dedicated cloud dashboard.

### 2. Advanced Backup Intelligence
Precision control over exactly what data is preserved:
- **Granular Component Selection**: Toggle individual categories for every backup run:
    - **Configs**: Save game settings and INI files.
    - **Saves**: Preserve the entire world state and player progress.
    - **Mods**: Archive the currently installed mod collection for exact environment parity.
- **Integrity Guard**: A background verification engine that performs checksum validation on archives to ensure they are 100% valid before a restore is attempted.

### 3. Multidimensional Visualizer
Navigate your server's history through intuitive visual interfaces:
- **Timeline Mode (📅)**: A chronological "Git-style" branch view that allows you to see the progression of your server's lifecycle over days and weeks.
- **Content Preview (👁️)**: Instant "Peeking" into any backup archive to view the file list without requiring a full extraction.
- **Storage Analytics**: Real-time cards displaying total storage utilization, backup counts, and last-successful-run timestamps.

### 4. Restoration & Maintenance Suite
Safe and efficient tools for managing your archival data:
- **Point-in-Time Restore**: A gated, high-priority restoration process that rolls back the server environment to an exact previous state.
- **Smart Cleanup**: One-click optimization tool to purge old, redundant snapshots based on configurable retention policies (e.g., "Keep Last 5").
- **Compression Engine**: Balances disk usage vs. backup speed using high-efficiency compression algorithms.

## 🛠️ Interface Controls
- **Create Backup [Plus]**: Trigger a manual snapshot with a custom configuration of components.
- **Verify [Shield]**: Manually trigger an integrity check on any existing backup.
- **View Toggle**: Switch between high-density `List View` and visual-narrative `Timeline View`.

## 🎨 Design Notes
- **Safety-First Colors**: Uses Amber and Orange gradients to denote the "Safe Harbor" nature of the management suite.
- **Visual Status Badges**: Uses animated `Pulse` effects for in-progress operations and high-contrast `Check/X` icons for integrity states.
- **Glassmorphism Stats**: Statistics cards use blurred backdrops with deep-dark shadows to maintain the "Liquid Glass" premium aesthetic.
