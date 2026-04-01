# LLMStore.pro

AI-агенты, инструменты и модели — маркетплейс и конструктор.

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск Docker (PostgreSQL + Redis)
docker compose up -d

# Применить схему БД
npm run db:push

# Заполнить начальные данные (admin@llmstore.pro / admin123!)
npm run db:seed

# Запуск dev-серверов (backend + frontend)
npm run dev
```

## Управление ролями пользователей

### Назначить роль через CLI

Скрипт `set-role.ts` позволяет назначить любую роль пользователю по email.

Доступные роли: `user`, `power_user`, `curator`, `admin`

```bash
# Сделать пользователя администратором
cd packages/backend
npx tsx src/scripts/set-role.ts rodion89@list.ru admin

# Сделать пользователя куратором
npx tsx src/scripts/set-role.ts user@example.com curator

# Понизить до обычного пользователя
npx tsx src/scripts/set-role.ts user@example.com user

# Назначить power_user
npx tsx src/scripts/set-role.ts user@example.com power_user
```

### Назначить роль через SQL

```bash
# Подключиться к PostgreSQL
docker exec -it llmstore-postgres psql -U llmstore -d llmstore

# Сделать пользователя админом по email
UPDATE users SET role = 'admin' WHERE email = 'rodion89@list.ru';

# Проверить роль
SELECT email, role, status FROM users WHERE email = 'rodion89@list.ru';

# Посмотреть всех админов
SELECT email, role, created_at FROM users WHERE role = 'admin';
```

## Управление балансом

### Через API

```bash
# Узнать ID пользователя
docker exec -it llmstore-postgres psql -U llmstore -d llmstore \
  -c "SELECT id, email, balance_usd FROM users WHERE email = 'rodion89@list.ru';"

# Пополнить баланс пользователю (нужна сессия админа)
curl -X POST http://localhost:3001/api/admin/users/<USER_ID>/balance \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<ADMIN_SESSION>" \
  -d '{"amount": 100.00, "description": "Начальное пополнение"}'

# Списать с баланса
curl -X POST http://localhost:3001/api/admin/users/<USER_ID>/balance \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<ADMIN_SESSION>" \
  -d '{"amount": -10.00, "description": "Корректировка"}'
```

### Через SQL

```bash
# Пополнить баланс напрямую
docker exec -it llmstore-postgres psql -U llmstore -d llmstore \
  -c "UPDATE users SET balance_usd = balance_usd + 100 WHERE email = 'rodion89@list.ru';"
```

## Админ-панель

Доступна по адресу `/admin` для пользователей с ролью `admin` или `curator`.

Разделы:
- `/admin` — управление каталогом
- `/admin/users` — управление пользователями, ролями, статусами и балансом
- `/admin/agents` — просмотр всех агентов в системе

## Деплой на сервер

```bash
# 1. Обновить код
cd /var/www/llmstore.pro
git pull origin main

# 2. Собрать shared
cd packages/shared
npm run build

# 3. Применить схему БД
cd ../backend
npm run db:push

# 4. Собрать backend
npm run build

# 5. Собрать frontend
cd ../frontend
npm run build

# 6. Перезапустить backend
pm2 restart llmstore-backend

# 7. Проверить
curl http://localhost:3002/api/health
```

Основной продовый деплой-скрипт:

```bash
cd /var/www/llmstore.pro
bash deploy.sh
```

## Бэкапы на сервере

Ежедневные backup-копии хранятся в:

`/var/backups/llmstore/YYYY-MM-DD`

Внутри каждой папки по дате лежат:
- `db/llmstore.dump` — дамп PostgreSQL в формате `pg_dump --format=custom`
- `uploads/chat/` — файлы чатов для корректного восстановления вложений
- `manifest.json` — метаданные backup-копии

По умолчанию хранятся последние `3` дня.

### Установка cron-задачи

```bash
cd /var/www/llmstore.pro
bash scripts/install-server-backup-cron.sh
```

Это создаёт задачу в `/etc/cron.d/llmstore-backup`, которая запускается ежедневно в `04:10`.
Лог пишется в `/var/log/llmstore-backup.log`.

### Создать backup вручную

```bash
cd /var/www/llmstore.pro
bash scripts/server-backup.sh
```

### Восстановиться на дату

```bash
cd /var/www/llmstore.pro
bash scripts/server-restore.sh 2026-04-01 --yes
```

Что делает restore:
- останавливает backend
- восстанавливает БД из `db/llmstore.dump`
- восстанавливает `uploads/chat`
- запускает backend обратно
- проверяет `http://localhost:3002/api/health`

Файлы backup-логики в репозитории:

```bash
scripts/server-backup.sh
scripts/server-restore.sh
scripts/install-server-backup-cron.sh
scripts/BACKUPS.md
```

## npm-скрипты

```bash
npm run dev          # Запуск всех пакетов в dev-режиме
npm run build        # Сборка всех пакетов
npm run lint         # Линтинг
npm run typecheck    # Проверка типов
npm run db:push      # Применить схему к БД
npm run db:seed      # Заполнить начальные данные
npm run db:studio    # GUI для БД (Drizzle Studio)
```
