#!/bin/sh

set -e

GITHUB_USER="nikgalkin"
REPO_NAME="finn"
APP_NAME="finn"

echo "========================================="
echo "📥 Starting installation of $APP_NAME..."
echo "========================================="

# --- 1. DETECT OPERATING SYSTEM ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

case "$OS" in
    linux)   TARGET_OS="linux" ;;
    darwin)  TARGET_OS="darwin" ;;
    msys*|mingw*|cygwin*) TARGET_OS="windows" ;;
    *) echo "❌ Unsupported Operating System: $OS"; exit 1 ;;
esac

# --- 2. DETECT CPU ARCHITECTURE ---
# If on macOS, check for native arm64 support via sysctl (handles Rosetta 2 emulation gracefully)
if [ "$TARGET_OS" = "darwin" ]; then
    if [ "$(sysctl -in hw.optional.arm64)" = "1" ]; then
        TARGET_ARCH="arm64"
    else
        TARGET_ARCH="amd64"
    fi
else
    # For Linux and Windows, fall back to standard uname
    ARCH="$(uname -m | tr '[:upper:]' '[:lower:]')"
    case "$ARCH" in
        x86_64|amd64) TARGET_ARCH="amd64" ;;
        arm64|aarch64) TARGET_ARCH="arm64" ;;
        *) echo "❌ Unsupported Architecture: $ARCH"; exit 1 ;;
    esac
fi

# Set windows extension suffix if applicable
SUFFIX=""
if [ "$TARGET_OS" = "windows" ]; then
    SUFFIX=".exe"
fi

# Form the exact artifact name matching our release pipeline
ARTIFACT_NAME="${APP_NAME}-${TARGET_OS}-${TARGET_ARCH}${SUFFIX}"

# --- 3. THE DIRECT DOWNLOAD URL (Reliable & bypasses API rate limits) ---
DOWNLOAD_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/latest/download/${ARTIFACT_NAME}"

# --- 4. DETERMINE INSTALL DIRECTORY ---
if [ "$TARGET_OS" = "windows" ]; then
    INSTALL_DIR="$HOME/bin"
else
    INSTALL_DIR="/usr/local/bin"
fi

# --- 5. DOWNLOAD AND INSTALL ---
mkdir -p "$INSTALL_DIR"
FINAL_PATH="$INSTALL_DIR/${APP_NAME}${SUFFIX}"

echo "ℹ️  Detected platform: $TARGET_OS / $TARGET_ARCH"
echo "🚚 Downloading $ARTIFACT_NAME..."
echo "From: $DOWNLOAD_URL"
echo "To: $FINAL_PATH"

# Check for write permissions, use sudo if required (except on Windows)
if [ "$TARGET_OS" != "windows" ] && [ ! -w "$INSTALL_DIR" ]; then
    echo "🔐 Required root privileges to write into $INSTALL_DIR"
    sudo curl -fsSL -o "$FINAL_PATH" "$DOWNLOAD_URL"
    sudo chmod +x "$FINAL_PATH"
    
    # Bypass macOS Gatekeeper quarantine attributes if running on Mac
    if [ "$TARGET_OS" = "darwin" ]; then
        sudo xattr -d com.apple.quarantine "$FINAL_PATH" 2>/dev/null || true
    fi
else
    curl -fsSL -o "$FINAL_PATH" "$DOWNLOAD_URL"
    chmod +x "$FINAL_PATH"
    
    # Bypass macOS Gatekeeper quarantine attributes if running on Mac
    if [ "$TARGET_OS" = "darwin" ]; then
        xattr -d com.apple.quarantine "$FINAL_PATH" 2>/dev/null || true
    fi
fi

echo "========================================="
echo "🎉 $APP_NAME has been successfully installed!"
echo "Run it anywhere by typing: $APP_NAME"
echo "========================================="
