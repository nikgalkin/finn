#!/bin/sh

set -e

GITHUB_USER="nikgalkin"
REPO_NAME="finn"
APP_NAME="finn"

echo "========================================="
echo "📥 Starting installation of $APP_NAME..."
echo "========================================="

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

case "$OS" in
    linux)   TARGET_OS="linux" ;;
    darwin)  TARGET_OS="darwin" ;;
    msys*|mingw*|cygwin*) TARGET_OS="windows" ;;
    *) echo "❌ Unsupported Operating System: $OS"; exit 1 ;;
esac

# Умное определение архитектуры
if [ "$TARGET_OS" = "darwin" ]; then
    # Если мы на Mac, проверяем поддержку arm64 на уровне процессора через sysctl
    if [ "$(sysctl -in hw.optional.arm64)" = "1" ]; then
        TARGET_ARCH="arm64"
    else
        TARGET_ARCH="amd64"
    fi
else
    # Для Linux и Windows оставляем стандартный uname
    ARCH="$(uname -m | tr '[:upper:]' '[:lower:]')"
    case "$ARCH" in
        x86_64|amd64) TARGET_ARCH="amd64" ;;
        arm64|aarch64) TARGET_ARCH="arm64" ;;
        *) echo "❌ Unsupported Architecture: $ARCH"; exit 1 ;;
    esac
fi

SUFFIX=""
if [ "$TARGET_OS" = "windows" ]; then
    SUFFIX=".exe"
fi

ARTIFACT_NAME="${APP_NAME}-${TARGET_OS}-${TARGET_ARCH}${SUFFIX}"

echo "🔍 Fetching latest release from GitHub..."
LATEST_RELEASE_URL="https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/releases/latest"

DOWNLOAD_URL=$(curl -s $LATEST_RELEASE_URL | grep "browser_download_url" | grep "$ARTIFACT_NAME" | cut -d '"' -f 4 | head -n 1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "❌ Could not find binary for $TARGET_OS/$TARGET_ARCH in the latest release."
    echo "Looking for asset named: $ARTIFACT_NAME"
    exit 1
fi

if [ "$TARGET_OS" = "windows" ]; then
    INSTALL_DIR="$HOME/bin"
else
    INSTALL_DIR="/usr/local/bin"
fi

mkdir -p "$INSTALL_DIR"
FINAL_PATH="$INSTALL_DIR/${APP_NAME}${SUFFIX}"

echo "🚚 Downloading $ARTIFACT_NAME..."
echo "To: $FINAL_PATH"

if [ "$TARGET_OS" != "windows" ] && [ ! -w "$INSTALL_DIR" ]; then
    echo "🔐 Required root privileges to write into $INSTALL_DIR"
    sudo curl -L -s -o "$FINAL_PATH" "$DOWNLOAD_URL"
    sudo chmod +x "$FINAL_PATH"
else
    curl -L -s -o "$FINAL_PATH" "$DOWNLOAD_URL"
    chmod +x "$FINAL_PATH"
fi

echo "========================================="
echo "🎉 $APP_NAME successfully installed!"
echo "Run it by typing: $APP_NAME"
echo "========================================="
