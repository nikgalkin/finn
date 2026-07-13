#!/usr/bin/env bash

set -e

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$GIT_ROOT"

BUILD_DIR="build"
APP_NAME="finn"
VERSION="${VERSION:-dev}"
LDFLAGS="-s -w -X main.version=${VERSION}"

# Гарантируем, что CGO отключен для всех собираемых платформ (важно для переносимости)
export CGO_ENABLED=0

# --- ШАГ 1: АВТОНОМНАЯ СБОРКА ФРОНТЕНДА ---
build_frontend() {
    if [ -d "frontend" ]; then
        echo "========================================="
        echo "📦 Installing Frontend Dependencies & Building..."
        echo "========================================="
        cd frontend
        # npm ci гарантирует чистую и строгую установку по package-lock.json
        npm ci --no-audit --no-fund
        npm run build
        cd "$GIT_ROOT"
    else
        echo "⚠️  Директория frontend не найдена! Пропускаем..."
    fi
}

# --- ШАГ 2: КОМПИЛЯЦИЯ GO БИНАРНИКА ---
build_target() {
    local os=$1
    local arch=$2
    local suffix=$3
    local output_name="${BUILD_DIR}/${APP_NAME}-${os}-${arch}${suffix}"
    
    echo "📦 Compiling Go binary for ${os}/${arch}..."
    GOOS=$os GOARCH=$arch go build -ldflags="$LDFLAGS" -o "$output_name" ./cmd/finn
    echo "✅ Success: $output_name"
    echo "-----------------------------------------"
}

# --- ОСНОВНАЯ ЛОГИКА ВЫПОЛНЕНИЯ ---

# 1. Всегда сначала собираем фронтенд, чтобы go:embed запекал свежую статику
build_frontend

# 2. Создаем папку для готовых бинарников
mkdir -p "$BUILD_DIR"

# 3. Проверяем аргументы командной строки
if [ -n "$1" ] && [ -n "$2" ]; then
    # Если переданы ОС и Архитектура (например: ./bin/build.sh linux amd64 в Matrix CI)
    TARGET_OS=$1
    TARGET_ARCH=$2
    
    echo "========================================="
    echo "🚀 Single Target Build ($VERSION) -> $TARGET_OS/$TARGET_ARCH"
    echo "========================================="
    
    if [ "$TARGET_OS" = "windows" ]; then
        build_target "$TARGET_OS" "$TARGET_ARCH" ".exe"
    else
        build_target "$TARGET_OS" "$TARGET_ARCH" ""
    fi
else
    # Если запущен без аргументов — собираем абсолютно всё за один раз (локальный тест)
    echo "========================================="
    echo "🚀 Full Multi-Platform Release Build ($VERSION)"
    echo "========================================="
    
    build_target "windows" "amd64" ".exe"
    build_target "linux"   "amd64" ""
    build_target "darwin"  "arm64" ""
fi

echo "========================================="
echo "🎉 Build process finished! Artifacts in ./${BUILD_DIR}/"
ls -lh "$BUILD_DIR"
echo "========================================="
