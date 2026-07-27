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

### Option B: Debian Package (.deb)
1. Download `ark-asa-server-manager_*.deb` from the [Releases](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases) page.
2. Install via `dpkg` or `apt`:
   ```bash
   sudo apt install ./ark-asa-server-manager_*.deb
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

- **SteamCMD Fails to Launch:** Ensure 32-bit libraries (`lib32gcc-s1`) are installed.
- **RCON Connection Refused:** Check that your local firewall allows TCP connections on your configured RCON port (e.g. 27020).
- **Executable Permissions:** The manager automatically applies `chmod +x` to server binaries. If manually copying binaries, run `chmod +x ArkAscendedServer ShooterGameServer steamcmd.sh`.
