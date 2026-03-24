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

### Назначить роль через SQL (на сервере)

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

### Управление балансом через CLI (curl)

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

### Управление балансом через SQL

```bash
# Пополнить баланс напрямую
docker exec -it llmstore-postgres psql -U llmstore -d llmstore \
  -c "UPDATE users SET balance_usd = balance_usd + 100 WHERE email = 'rodion89@list.ru';"
```

## Админ-панель

Доступна по адресу `/admin` для пользователей с ролью `admin` или `curator`.

Разделы:
- `/admin` — управление каталогом (CRUD элементов, категорий, тегов)
- `/admin/users` — управление пользователями (роли, статусы, баланс)
- `/admin/agents` — просмотр всех агентов в системе

## Деплой на сервер

```bash
# 1. Обновить код
cd /var/www/llmstore.pro
git pull origin main

# 2. Собрать shared
cd packages/shared
npm run build

# 3. Применить миграции
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
curl http://localhost:3001/api/health
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
