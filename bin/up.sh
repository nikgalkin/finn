#!/bin/bash

# Останавливаем скрипт при любой ошибке
set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Находим корень git-репозитория и переходим в него
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$GIT_ROOT"

PORT=8080
URL="http://localhost:$PORT"
FRONT_BUILD_DIR="frontend/dist"
BIN_DIR="build"
BINARY="$BIN_DIR/finn"

mkdir -p "$BIN_DIR"

FORCE_BUILD=0
FINN_ARGS=()
for arg in "$@"; do
    case "$arg" in
        --force-build)
            FORCE_BUILD=1
            ;;
        *)
            FINN_ARGS+=("$arg")
            ;;
    esac
done
set -- "${FINN_ARGS[@]}"

if [ "$FORCE_BUILD" -eq 1 ]; then
    echo -e "${YELLOW}Включена принудительная пересборка фронтенда и Go-бинарника.${NC}"
fi

# Переменная-флаг: нужно ли пересобирать Go бинарник
NEED_GO_BUILD=0

# --- ШАГ 1: ПРОВЕРКА NODE_MODULES ---
echo -e "${BLUE}[1/4] Проверяем зависимости фронтенда...${NC}"
if [ ! -d "frontend/node_modules" ] || [ -n "$(find frontend/package-lock.json -newer frontend/node_modules 2>/dev/null)" ]; then
    echo -e "${YELLOW}Зависимости устарели или отсутствуют. Запускаем npm install...${NC}"
    cd frontend
    npm install --no-audit --no-fund
    cd "$GIT_ROOT"
else
    echo -e "${GREEN}Зависимости фронтенда в порядке! ⚡${NC}"
fi


# --- ШАГ 2: СБОРКА ФРОНТЕНДА (REACT) ---
echo -e "${BLUE}[2/4] Проверяем кэш фронтенда...${NC}"

# Проверяем, изменились ли исходники фронта по сравнению с готовым index.html
if [ "$FORCE_BUILD" -eq 1 ] || [ ! -f "$FRONT_BUILD_DIR/index.html" ] || [ -n "$(find frontend/src frontend/package.json -newer "$FRONT_BUILD_DIR/index.html" 2>/dev/null)" ]; then
    if [ "$FORCE_BUILD" -eq 1 ]; then
        echo -e "${YELLOW}Принудительно собираем фронтенд...${NC}"
    else
        echo -e "${YELLOW}Нашли изменения в React-коде. Собираем фронтенд...${NC}"
    fi
    cd frontend
    npm run build
    cd "$GIT_ROOT"
    
    # Фронтенд изменился -> значит //go:embed должен его перепечь! Включаем флаг.
    NEED_GO_BUILD=1
else
    echo -e "${GREEN}React-код не менялся, берем из кэша! ⚡${NC}"
fi


# --- ШАГ 3: СБОРКА БЭКЕНДА (GO) ---
echo -e "${BLUE}[3/4] Проверяем бэкенд на Go...${NC}"

# Проверяем изменения:
# 1. Есть ли вообще бинарник
# 2. Появились ли новые изменения в любых файлах .go (ищем рекурсивно)
# 3. Изменилось ли что-то в папке demo/ (наш demo.sql)
# 4. Был ли пересобран фронтенд на Шаге 2
if [ "$FORCE_BUILD" -eq 1 ] || \
   [ ! -f "$BINARY" ] || \
   [ -n "$(find . -name '*.go' -newer "$BINARY" 2>/dev/null)" ] || \
   [[ -d "demo" && -n "$(find demo -newer "$BINARY" 2>/dev/null)" ]] || \
   [ $NEED_GO_BUILD -eq 1 ]; then
    
    if [ "$FORCE_BUILD" -eq 1 ]; then
        echo -e "${YELLOW}Принудительно собираем Go-бинарник в $BINARY...${NC}"
    else
        echo -e "${YELLOW}Обнаружены изменения в Go-коде или ресурсах demo/. Собираем в $BINARY...${NC}"
    fi
    # Собираем исполняемый пакет из cmd/finn, указывая выходной файл (-o)
    go build -o "$BINARY" ./cmd/finn
    echo -e "${GREEN}Бэкенд успешно скомпилирован!${NC}"
else
    echo -e "${GREEN}Бэкенд, демо-данные и статика не менялись, пропускаем компиляцию! ⚡${NC}"
fi

# --- ШАГ 4: ЗАПУСК ПРИЛОЖЕНИЯ ---
echo -e "${BLUE}[4/4] Запускаем сервер...${NC}"

# Если локально в bash была выставлена переменная NO_OPEN=1, передаем флаг в Go
if [[ ${NO_OPEN:-0} == 1 ]]; then
    "$BINARY" -no-open "$@"
else
    "$BINARY" "$@"
fi

# make a sql dump for db
# sqlite3 finn.db .dump > demo/demo.sql
