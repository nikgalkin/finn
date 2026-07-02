#!/usr/bin/env bash

# Останавливать скрипт при любой ошибке
set -e

# Папка для готовых бинарников
BUILD_DIR="build"
APP_NAME="budget-tracker"

echo "========================================="
echo "🚀 Starting Cross-Compilation (Pure Go)..."
echo "========================================="

# Создаем папку для билдов, если её нет
mkdir -p "$BUILD_DIR"

# Гарантируем, что CGO отключен для всех сборок
export CGO_ENABLED=0

# --- 1. WINDOWS (AMD64) ---
echo "📦 Building for Windows (amd64)..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$BUILD_DIR/${APP_NAME}-win-amd64.exe" main.go db.go api.go
echo "✅ Windows build done."
echo "-----------------------------------------"

# --- 2. LINUX (AMD64) ---
echo "📦 Building for Linux (amd64)..."
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$BUILD_DIR/${APP_NAME}-linux-amd64" main.go db.go api.go
echo "✅ Linux build done."
echo "-----------------------------------------"

# --- 3. MACOS (ARM64 / Apple Silicon M1/M2/M3) ---
echo "📦 Building for macOS (arm64)..."
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "$BUILD_DIR/${APP_NAME}-macos-arm64" main.go db.go api.go
echo "✅ macOS build done."

echo "========================================="
echo "🎉 All builds successfully generated in ./${BUILD_DIR}/"
ls -lh "$BUILD_DIR"
echo "========================================="
