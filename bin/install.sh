#!/bin/sh

set -e

GITHUB_USER="nikgalkin"
REPO_NAME="finn"
APP_NAME="finn"

usage() {
    echo "Usage: $0 [--version <version> | <version>]"
    echo "Example: $0 --version v1.8.0"
}

VERSION="${FINN_VERSION:-}"

case "$#" in
    0) ;;
    1)
        case "$1" in
            -h|--help) usage; exit 0 ;;
            --version) echo "❌ Missing value for --version"; usage; exit 1 ;;
            -*) echo "❌ Unknown argument: $1"; usage; exit 1 ;;
            *) VERSION="$1" ;;
        esac
        ;;
    2)
        if [ "$1" != "--version" ]; then
            echo "❌ Unknown argument: $1"
            usage
            exit 1
        fi
        VERSION="$2"
        ;;
    *)
        usage
        exit 1
        ;;
esac

if [ -n "$VERSION" ]; then
    case "$VERSION" in
        v*) ;;
        *) VERSION="v${VERSION}" ;;
    esac

    case "$VERSION" in
        v[0-9]*) ;;
        *)
            echo "❌ Invalid version: $VERSION"
            exit 1
            ;;
    esac

    case "$VERSION" in
        *[!A-Za-z0-9._-]*)
            echo "❌ Invalid version: $VERSION"
            exit 1
            ;;
    esac

    RELEASE_PATH="download/${VERSION}"
    VERSION_LABEL="$VERSION"
else
    RELEASE_PATH="latest/download"
    VERSION_LABEL="latest"
fi

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
DOWNLOAD_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/${RELEASE_PATH}/${ARTIFACT_NAME}"

# --- 4. DETERMINE INSTALL DIRECTORY ---
if [ "$TARGET_OS" = "windows" ]; then
    INSTALL_DIR="$HOME/bin"
else
    INSTALL_DIR="/usr/local/bin"
fi

# --- 5. DOWNLOAD AND INSTALL ---
mkdir -p "$INSTALL_DIR"
FINAL_PATH="$INSTALL_DIR/${APP_NAME}${SUFFIX}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}.XXXXXX")"
TEMP_PATH="$TEMP_DIR/$ARTIFACT_NAME"
STAGED_PATH=""

cleanup() {
    if [ -n "$STAGED_PATH" ]; then
        rm -f "$STAGED_PATH" 2>/dev/null || true
    fi
    rm -f "$TEMP_PATH" 2>/dev/null || true
    rmdir "$TEMP_DIR" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 1' HUP INT TERM

echo "ℹ️  Detected platform: $TARGET_OS / $TARGET_ARCH"
echo "ℹ️  Version: $VERSION_LABEL"
echo "🚚 Downloading $ARTIFACT_NAME..."
echo "From: $DOWNLOAD_URL"
echo "To: $FINAL_PATH"

# Download and validate before touching an existing installation
curl -fsSL -o "$TEMP_PATH" "$DOWNLOAD_URL"
chmod +x "$TEMP_PATH"

if [ "$TARGET_OS" = "darwin" ]; then
    xattr -d com.apple.quarantine "$TEMP_PATH" 2>/dev/null || true
    if ! codesign --verify --strict "$TEMP_PATH"; then
        echo "❌ Downloaded binary has an invalid code signature; existing installation was not changed"
        exit 1
    fi
fi

echo "🔎 Validating downloaded binary..."
if ! INSTALLED_VERSION="$("$TEMP_PATH" -v)"; then
    echo "❌ Downloaded binary failed validation; existing installation was not changed"
    exit 1
fi

case "$INSTALLED_VERSION" in
    "$APP_NAME version "*) ;;
    *)
        echo "❌ Downloaded file returned an unexpected version; existing installation was not changed"
        exit 1
        ;;
esac

# Stage the validated binary beside the destination, then replace it atomically
if [ "$TARGET_OS" != "windows" ] && [ ! -w "$INSTALL_DIR" ]; then
    echo "🔐 Required root privileges to write into $INSTALL_DIR"
    STAGED_PATH="$(sudo mktemp "${INSTALL_DIR}/.${APP_NAME}.XXXXXX")"

    if ! sudo install -m 0755 "$TEMP_PATH" "$STAGED_PATH"; then
        sudo rm -f "$STAGED_PATH"
        exit 1
    fi

    if [ "$TARGET_OS" = "darwin" ]; then
        sudo xattr -d com.apple.quarantine "$STAGED_PATH" 2>/dev/null || true
    fi

    if ! sudo mv -f "$STAGED_PATH" "$FINAL_PATH"; then
        sudo rm -f "$STAGED_PATH"
        exit 1
    fi
else
    STAGED_PATH="$(mktemp "${INSTALL_DIR}/.${APP_NAME}.XXXXXX")"
    cp "$TEMP_PATH" "$STAGED_PATH"
    chmod +x "$STAGED_PATH"

    if [ "$TARGET_OS" = "darwin" ]; then
        xattr -d com.apple.quarantine "$STAGED_PATH" 2>/dev/null || true
    fi

    mv -f "$STAGED_PATH" "$FINAL_PATH"
fi

STAGED_PATH=""

echo "========================================="
echo "🎉 $APP_NAME has been successfully installed!"
echo "Run it anywhere by typing: $APP_NAME"
echo "$INSTALLED_VERSION"
echo "========================================="
