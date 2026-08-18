#!/usr/bin/env bash
set -e

# ==============================================================================
# ARK Server Manager 2.0 - Linux CLI & Daemon Installer
# Repository: https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0
# ==============================================================================

REPO="sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0"
BINARY_NAME="asa_manager"
INSTALL_DIR="/usr/local/bin"
FALLBACK_INSTALL_DIR="$HOME/.local/bin"

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║       ARK: Server Manager 2.0 - Headless CLI & Daemon Installer      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Architecture and OS
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

if [ "$OS" != "linux" ]; then
    echo -e "${RED}❌ Error: This installer is intended for Linux operating systems.${NC}"
    exit 1
fi

echo -e "🔍 Detected System: ${BOLD}${OS} (${ARCH})${NC}"

# Ensure essential dependencies
echo -e "\n📦 Checking system dependencies..."
MISSING_PKGS=""
for cmd in curl tar git; do
    if ! command -v "$cmd" &> /dev/null; then
        MISSING_PKGS="$MISSING_PKGS $cmd"
    fi
done

if [ -n "$MISSING_PKGS" ]; then
    echo -e "${YELLOW}⚠️ Missing required utilities:${MISSING_PKGS}${NC}"
    echo "Attempting to install missing tools (requires sudo)..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y curl tar git build-essential
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y curl tar git gcc gcc-c++
    elif command -v pacman &> /dev/null; then
        sudo pacman -Sy --noconfirm curl tar git base-devel
    else
        echo -e "${RED}Please manually install:${MISSING_PKGS}${NC}"
        exit 1
    fi
fi

# Determine target install directory
TARGET_DIR="$INSTALL_DIR"
USE_SUDO=false

if [ "$EUID" -ne 0 ]; then
    if sudo -n true 2>/dev/null || [ -w "$INSTALL_DIR" ]; then
        USE_SUDO=true
    else
        echo -e "${YELLOW}ℹ️ Installing to user directory ($FALLBACK_INSTALL_DIR) without sudo.${NC}"
        TARGET_DIR="$FALLBACK_INSTALL_DIR"
        mkdir -p "$TARGET_DIR"
    fi
fi

# Attempt to download pre-compiled release binary or build from source
SUCCESS=false

echo -e "\n🌐 Checking for prebuilt ${BINARY_NAME} release binary..."
LATEST_TAG=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || true)

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if [ -n "$LATEST_TAG" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/asa_manager-linux-${ARCH}.tar.gz"
    echo -e "Attempting download from: ${DOWNLOAD_URL}"
    
    if curl -sLf "$DOWNLOAD_URL" -o "$TMP_DIR/asa_manager.tar.gz" 2>/dev/null; then
        echo -e "${GREEN}✓ Download successful! Extracting...${NC}"
        tar -xzf "$TMP_DIR/asa_manager.tar.gz" -C "$TMP_DIR"
        if [ -f "$TMP_DIR/$BINARY_NAME" ]; then
            chmod +x "$TMP_DIR/$BINARY_NAME"
            if [ "$USE_SUDO" = true ]; then
                sudo cp "$TMP_DIR/$BINARY_NAME" "$TARGET_DIR/$BINARY_NAME"
            else
                cp "$TMP_DIR/$BINARY_NAME" "$TARGET_DIR/$BINARY_NAME"
            fi
            SUCCESS=true
        fi
    fi
fi

# Fallback: Build from source with Cargo if prebuilt binary not found or failed
if [ "$SUCCESS" = false ]; then
    echo -e "${YELLOW}⚙️ Prebuilt binary not found on release assets. Building from source via Cargo...${NC}"
    
    if ! command -v cargo &> /dev/null; then
        echo -e "📦 Rust toolchain not found. Installing Rust (rustup)..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        # shellcheck source=/dev/null
        source "$HOME/.cargo/env"
    fi

    echo -e "📥 Cloning repository source..."
    git clone --depth 1 "https://github.com/${REPO}.git" "$TMP_DIR/repo"
    
    echo -e "🔨 Building ${BINARY_NAME} in release mode..."
    cargo build --release --manifest-path "$TMP_DIR/repo/asa-cli/Cargo.toml"
    
    COMPILED_BIN="$TMP_DIR/repo/asa-cli/target/release/$BINARY_NAME"
    if [ -f "$COMPILED_BIN" ]; then
        if [ "$USE_SUDO" = true ]; then
            sudo cp "$COMPILED_BIN" "$TARGET_DIR/$BINARY_NAME"
        else
            cp "$COMPILED_BIN" "$TARGET_DIR/$BINARY_NAME"
        fi
        SUCCESS=true
    fi
fi

if [ "$SUCCESS" = true ]; then
    # Ensure directory is in PATH
    if [[ ":$PATH:" != *":$TARGET_DIR:"* ]]; then
        echo -e "\n${YELLOW}⚠️ Notice: ${TARGET_DIR} is not in your current PATH.${NC}"
        echo -e "Add this to your ~/.bashrc or ~/.zshrc:"
        echo -e "  export PATH=\"\$PATH:${TARGET_DIR}\""
    fi

    # Create default app configuration folders
    mkdir -p "$HOME/.config/com.ark.asaservermanager"
    mkdir -p "$HOME/ASA_Backups"
    mkdir -p "$HOME/ASA_Clusters"

    echo -e "\n${GREEN}${BOLD}🎉 Installation Complete!${NC}"
    echo -e "The CLI binary is installed at: ${BOLD}${TARGET_DIR}/${BINARY_NAME}${NC}\n"
    echo -e "${BOLD}Quick Usage Examples:${NC}"
    echo -e "  ${BLUE}asa_manager --help${NC}                                # Show all commands"
    echo -e "  ${BLUE}asa_manager --server-path /path/to/server config --show${NC} # View server config"
    echo -e "  ${BLUE}asa_manager --server-path /path/to/server config --optimize${NC} # Apply performance tweaks"
    echo -e "  ${BLUE}asa_manager --server-path /path/to/server update-mods${NC}   # Update CurseForge mods"
    echo -e "  ${BLUE}asa_manager --server-path /path/to/server backup${NC}        # Create world save backup"
    echo -e "  ${BLUE}asa_manager --server-path /path/to/server verify --all${NC}  # Verify server integrity"
else
    echo -e "\n${RED}❌ Installation failed. Please ensure git, gcc, and cargo are installed.${NC}"
    exit 1
fi
