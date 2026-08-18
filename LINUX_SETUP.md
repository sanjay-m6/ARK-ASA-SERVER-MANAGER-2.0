# Linux Setup & Installation Guide - ARK Server Manager 2.0

This guide provides instructions for running and deploying **ARK: Server Manager 2.0** on Linux operating systems (Ubuntu, Debian, RHEL, Fedora, Arch Linux).

---

## Prerequisites & Dependencies

Before running the manager or hosting ARK servers on Linux, ensure the following system dependencies are installed:

### 1. 32-bit Architecture & Libraries (Required for SteamCMD)
SteamCMD requires 32-bit `glibc` and `lib32gcc-s1` binaries.

**Ubuntu / Debian:**
```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y lib32gcc-s1 lib32stdc++6 libc6-i386 tar unzip wget ca-certificates
```

**Fedora / RHEL / CentOS:**
```bash
sudo dnf install -y glibc.i686 libstdc++.i686 tar unzip wget ca-certificates
```

**Arch Linux:**
```bash
sudo pacman -S --needed multilib-devel lib32-gcc-libs tar unzip wget ca-certificates
```

---

## Installation Options

### Option A: AppImage (Recommended)
1. Download `ARK_Server_Manager_*.AppImage` from the [Releases](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases) page.
2. Grant executable permission:
   ```bash
   chmod +x ARK_Server_Manager_*.AppImage
   ```
3. Launch the application:
   ```bash
   ./ARK_Server_Manager_*.AppImage
   ```

### Option B: Debian Package (.deb) (Desktop GUI)
1. Download `ark-asa-server-manager_*.deb` from the [Releases](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases) page.
2. Install via `dpkg` or `apt`:
   ```bash
   sudo apt install ./ark-asa-server-manager_*.deb
   ```

### Option C: Headless CLI & Automation Daemon (`asa_manager`) (Recommended for Headless Servers / VPS)
For headless servers without a GUI display server (no X11 / Wayland), use the lightweight CLI tool:

**One-Line Auto Installer:**
```bash
curl -fsSL https://raw.githubusercontent.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/main/scripts/install.sh | bash
```

**Or Build from Source with Cargo:**
```bash
# 1. Clone repo
git clone https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0.git
cd ARK-ASA-SERVER-MANAGER-2.0/asa-cli

# 2. Build release binary
cargo build --release

# 3. Move binary to PATH
sudo cp target/release/asa_manager /usr/local/bin/

# 4. Verify
asa_manager --help
```

**CLI Command Cheatsheet:**
```bash
# View configuration
asa_manager --server-path /path/to/server config --show

# Apply performance multipliers
asa_manager --server-path /path/to/server config --optimize --xp 2.0 --harvest 3.0 --taming 5.0

# Download and update CurseForge mods
asa_manager --server-path /path/to/server update-mods

# Create a timestamped world backup
asa_manager --server-path /path/to/server backup

# Verify server files and mod integrity
asa_manager --server-path /path/to/server verify --mods --config --saves
```

---

## System Configurations

### 1. File Descriptors & Process Limits
ARK servers handle thousands of concurrent file descriptors and network sockets. Increase the user limits:

Add to `/etc/security/limits.conf`:
```text
* soft nofile 100000
* hard nofile 100000
```

### 2. Firewall Rules (UFW / Firewalld)
The manager automatically detects and configures local firewall ports if `ufw` or `firewalld` is installed.

**Manual UFW command examples:**
```bash
# Allow Game & RCON Ports
sudo ufw allow 7777/udp
sudo ufw allow 27015/udp
sudo ufw allow 27020/tcp
sudo ufw reload
```

---

## Path Locations on Linux

- **App Config & Database:** `~/.config/com.ark.asaservermanager/`
- **Default Backups:** `~/ASA_Backups/`
- **Default Clusters:** `~/ASA_Clusters/`
- **SteamCMD Location:** `~/.config/com.ark.asaservermanager/steamcmd/`

---

## Troubleshooting

- **AppImage Crashes with "Failed to initialize GTK":** This occurs when running the Desktop GUI AppImage on a headless server without an X11 or Wayland display server.
  - **Solution 1 (Recommended):** Use the headless CLI tool `asa_manager` (see Option C above).
  - **Solution 2:** If you need to run the GUI on a headless server, run it inside a virtual framebuffer:
    ```bash
    sudo apt install -y xvfb
    xvfb-run ./ARK_Server_Manager_*.AppImage
    ```
- **SteamCMD Fails to Launch:** Ensure 32-bit libraries (`lib32gcc-s1`) are installed.
- **RCON Connection Refused:** Check that your local firewall allows TCP connections on your configured RCON port (e.g. 27020).
- **Executable Permissions:** The manager automatically applies `chmod +x` to server binaries. If manually copying binaries, run `chmod +x ArkAscendedServer ShooterGameServer steamcmd.sh`.
