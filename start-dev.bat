@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title LLMStore.pro — Dev Environment

echo ========================================
echo  LLMStore.pro — Запуск dev-окружения
echo ========================================
echo.

:: Проверка Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден. Установите Node.js 18+.
    pause
    exit /b 1
)

:: Проверка Docker CLI
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Docker не найден. Установите Docker Desktop.
    pause
    exit /b 1
)

:: Проверка что Docker daemon работает
echo [INFO] Проверка Docker daemon...
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok

echo [INFO] Docker daemon не запущен. Пытаюсь запустить Docker Desktop...

set "DOCKER_EXE="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%LOCALAPPDATA%\Docker\Docker Desktop.exe" set "DOCKER_EXE=%LOCALAPPDATA%\Docker\Docker Desktop.exe"

if not defined DOCKER_EXE (
    echo [ОШИБКА] Docker Desktop не найден. Запустите его вручную.
    pause
    exit /b 1
)

start "" "!DOCKER_EXE!"
echo [INFO] Ожидание запуска Docker daemon...

set /a DOCKER_WAIT=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
set /a DOCKER_WAIT+=1
if !DOCKER_WAIT! GEQ 60 (
    echo [ОШИБКА] Docker daemon не запустился за 120 секунд.
    echo         Запустите Docker Desktop вручную и попробуйте снова.
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_docker

:docker_ok
echo [OK] Docker daemon работает.

:: Копируем .env если нет
if not exist .env (
    echo [INFO] Файл .env не найден, копирую из .env.example...
    copy .env.example .env >nul
    echo [INFO] Отредактируйте .env и заполните OPENROUTER_API_KEY
    echo.
)

:: Запуск Docker (Postgres + Redis)
echo [1/5] Запуск PostgreSQL и Redis...
docker compose up -d
if errorlevel 1 (
    echo [ОШИБКА] Не удалось запустить Docker контейнеры.
    pause
    exit /b 1
)

:: Ждём готовности Postgres
echo [2/5] Ожидание готовности PostgreSQL...
set /a PG_WAIT=0
:wait_pg
docker compose exec -T postgres pg_isready -U llmstore >nul 2>&1
if not errorlevel 1 goto pg_ok
set /a PG_WAIT+=1
if !PG_WAIT! GEQ 30 (
    echo [ОШИБКА] PostgreSQL не стал ready за 60 секунд.
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_pg

:pg_ok
echo        PostgreSQL готов.

:: Установка зависимостей (если нет node_modules)
if not exist node_modules (
    echo [3/5] Установка зависимостей...
    call npm install
) else (
    echo [3/5] Зависимости уже установлены.
)

:: Сборка shared пакета
echo [4/5] Сборка @llmstore/shared...
call npm run build -w @llmstore/shared

:: Пуш схемы + сид
echo [5/5] Применение схемы БД и загрузка seed-данных...
call npm run db:push
call npm run db:seed

echo.
echo ========================================
echo  Всё готово! Запускаю dev-серверы...
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:5173
echo  Health:   http://localhost:3001/api/health
echo ========================================
echo.

:: Запуск dev
call npm run dev
