#!/bin/bash

# Останавливаем скрипт при любой ошибке
set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # Без цвета

# 1. Находим корень git-репозитория и переходим в него. 
# Если папка вдруг не под git, падаем на pwd (текущую директорию).
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
echo $GIT_ROOT
cd "$GIT_ROOT"

# Настройки путей (все пути теперь считаются от корня проекта)
PORT=8080
URL="http://localhost:$PORT"
FRONT_BUILD_DIR="frontend/dist" # Или frontend/build
BIN_DIR="bin"
BINARY="$BIN_DIR/budget-tracker"

# Убедимся, что папка bin существует (если скрипт запускают не из неё)
mkdir -p "$BIN_DIR"

echo -e "${BLUE}[1/3] Проверяем фронтенд...${NC}"
# Проверяем кэш фронтенда
if [ ! -f "$FRONT_BUILD_DIR/index.html" ] || [ -n "$(find frontend/src frontend/package.json -newer $FRONT_BUILD_DIR/index.html 2>/dev/null)" ]; then
    echo -e "${YELLOW}Нашли изменения во фронтенде (или сборки нет). Запускаем билд...${NC}"
    cd frontend
    npm run build
    # Возвращаемся в корень
    cd "$GIT_ROOT"
    go build -o "$BINARY"
else
    echo -e "${GREEN}Фронтенд не менялся, берем из кэша! ⚡${NC}"
fi

echo -e "${BLUE}[2/3] Проверяем бэкенд на Go...${NC}"
# Проверяем кэш бэкенда (ищем изменения в *.go файлах)
if [ ! -f "$BINARY" ] || [ -n "$(find . -name '*.go' -newer "$BINARY" 2>/dev/null)" ] || [ ! -f "$FRONT_BUILD_DIR/index.html" ] || [ -n "$(find frontend/src frontend/package.json -newer $FRONT_BUILD_DIR/index.html 2>/dev/null)" ]; then
    echo -e "${YELLOW}Код бэкенда изменился. Компилируем в $BIN_DIR/...${NC}"
    # Флаг -o кладет готовый бинарник прямиком в папку bin/
    go build -o "$BINARY"
else
    echo -e "${GREEN}Бэкенд не менялся, пропускаем компиляцию! ⚡${NC}"
fi

open_browser() {
    if [[ $NO_OPEN == 1 ]]; then
        echo skip..
    elif command -v open &> /dev/null; then
        open "$URL"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$URL"
    elif command -v start &> /dev/null; then
        start "$URL"
    else
        echo -e "${YELLOW}Не смог определить ОС для автооткрытия браузера. Открой сам: $URL${NC}"
    fi
}

echo -e "${GREEN}[3/3] Все готово! Запускаем сервер...${NC}"

# Фоновый процесс для открытия браузера
(sleep 1 && open_browser) &

# Запускаем бинарник из папки bin
"$BINARY"
