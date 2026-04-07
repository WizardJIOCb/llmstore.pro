# SDD: Инструмент «Текущая дата и время» с авто-прикреплением к каждому новому чату

## 1) Цель

Добавить встроенный инструмент **«Текущая дата и время»** (slug: `current-date-time`) и автоматически прикреплять его к **каждому новому чату** при создании, чтобы модель могла по запросу получать точное серверное время в момент tool-call.

---

## 2) Контекст текущей реализации (as-is)

На текущий момент в проекте уже есть:

1. **Сидирование built-in инструментов** через `packages/backend/src/db/seed/builtin-tools.ts`.
2. **Реестр исполнителей инструментов** (по `slug`) в `packages/backend/src/modules/tool-execution/executors/index.ts`.
3. **Передача tools в LLM** в рантайме через `startRun` в `packages/backend/src/modules/agent-runtime/runtime.service.ts` (массив `toolParams`).
4. **Создание чата** в `createChat(...)` в `runtime.service.ts`, где `tool_ids` сейчас берутся из пользовательского ввода и не дополняются автоматически.
5. Уже есть системный блок `environment_context` (с текущей датой/временем) через `buildModelEnvironmentContext()`, но это статический срез на момент запроса к модели; отдельного time-tool для явного повторного запроса времени нет.

---

## 3) Требования

### 3.1 Функциональные

1. Добавить новый built-in tool:
   - `name`: `Текущая дата и время`
   - `slug`: `current-date-time`
   - `tool_type`: `mock_tool` (без миграции enum в БД; инструмент исполняется по slug-роутингу)
   - `description`: получение текущих даты/времени и таймзоны сервера.
2. Инструмент должен не требовать входных параметров.
3. Результат должен содержать:
   - `current_datetime_utc` (ISO8601)
   - `current_date_utc` (`YYYY-MM-DD`)
   - `current_time_utc` (`HH:mm:ss`)
   - `timezone` (например, `Etc/UTC`)
   - `unix_ms`
4. При создании **любого нового чата** (general/agent) инструмент должен автоматически добавляться в `tool_ids`, даже если пользователь его явно не выбрал.
5. Автодобавление должно быть идемпотентным (без дублей).

### 3.2 Нефункциональные

1. Не ломать существующую логику пользовательского выбора инструментов.
2. Не требовать изменений фронтенд-флоу создания чата.
3. Избежать изменения DB enum для `tool_type` (минимальный риск).
4. Добавить unit/integration проверки на автоприкрепление и исполнение.

---

## 4) Дизайн решения (to-be)

## 4.1 Новый built-in tool

### Файл
`packages/backend/src/db/seed/builtin-tools.ts`

### Изменения
Добавить элемент в `builtinTools`:

- `name: 'Текущая дата и время'`
- `slug: 'current-date-time'`
- `tool_type: 'mock_tool'`
- `description: 'Возвращает текущее серверное время в UTC и служебные time-поля.'`
- `input_schema`:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```
- `output_schema`:
```json
{
  "type": "object",
  "properties": {
    "current_datetime_utc": { "type": "string" },
    "current_date_utc": { "type": "string" },
    "current_time_utc": { "type": "string" },
    "timezone": { "type": "string" },
    "unix_ms": { "type": "number" }
  }
}
```
- `config_json: {}`
- `is_builtin: true`
- `is_active: true`

> Почему `mock_tool`: в текущей архитектуре рантайм-исполнитель выбирается по `slug`, а не по `tool_type`; это позволяет добавить функционал без DB-миграции enum.

---

## 4.2 Исполнитель инструмента

### Файл
`packages/backend/src/modules/tool-execution/executors/index.ts`

### Изменения
Зарегистрировать executor:

- key: `current-date-time`
- output строить от `new Date()`:
  - `current_datetime_utc = now.toISOString()`
  - `current_date_utc = now.toISOString().slice(0, 10)`
  - `current_time_utc = now.toISOString().slice(11, 19)`
  - `timezone = 'Etc/UTC'`
  - `unix_ms = now.getTime()`

> Примечание: intentionally возвращаем UTC как единый канон для предсказуемости; локальную TZ можно добавить позже отдельными полями.

---

## 4.3 Автоматическое прикрепление к каждому новому чату

### Файл
`packages/backend/src/modules/agent-runtime/runtime.service.ts`

### Изменения
1. Добавить helper (в блок утилит файла):
   - `const AUTO_ATTACH_TOOL_SLUGS = ['current-date-time']`
   - функцию резолва slug -> id для активных инструментов (кэшируемую в памяти процесса с TTL 1–5 минут).
2. В `createChat(...)` после `normalizedToolIds`:
   - получить ids auto-tools;
   - объединить с пользовательскими tool_ids через `Set`;
   - использовать объединённый список в:
     - `validateChatToolSelection(...)`
     - `initialSettings` (`tool_ids`)
     - `ensureChatToolRuntimeAgent(...)` для general mode.
3. Поведение при проблеме резолва:
   - если auto-tool отсутствует в БД (не просидирован/неактивен), логировать warning и продолжать создание чата без падения (soft-fail), чтобы не блокировать пользователей.

---

## 4.4 Обратная совместимость

- Существующие чаты не меняются автоматически.
- Новые чаты получают инструмент при создании.
- UI выбора tools остаётся прежним; даже при пустом выборе пользователь всё равно получит auto-tool.

---

## 5) Изменения по файлам

1. `packages/backend/src/db/seed/builtin-tools.ts`
   - добавить запись built-in инструмента `current-date-time`.
2. `packages/backend/src/modules/tool-execution/executors/index.ts`
   - добавить executor для slug `current-date-time`.
3. `packages/backend/src/modules/agent-runtime/runtime.service.ts`
   - добавить логику auto-attach по slug для `createChat(...)`.
4. (опционально) тесты:
   - `packages/backend/src/modules/tool-execution/executors/__tests__/current-date-time.executor.test.ts`
   - `packages/backend/src/modules/agent-runtime/__tests__/create-chat.auto-tools.test.ts`

---

## 6) Алгоритм createChat после изменений

1. Нормализовать входные `tool_ids`.
2. Получить `autoToolIds` по `AUTO_ATTACH_TOOL_SLUGS`.
3. Слить списки: `effectiveToolIds = unique(userToolIds + autoToolIds)`.
4. Валидация `effectiveToolIds` (только активные).
5. Сохранить `effectiveToolIds` в `settings_json` нового чата.
6. Для `mode=general` и непустого `effectiveToolIds` создать/обновить внутренний tool-runtime-agent.

---

## 7) Тест-план

### 7.1 Unit: executor

- Возврат всех ожидаемых полей.
- `current_datetime_utc` валидный ISO.
- `unix_ms` число > 0.

### 7.2 Integration: createChat

1. **Пустые `tool_ids` во входе** → в сохранённом чате присутствует `current-date-time`.
2. **`tool_ids` уже содержит current-date-time** → дублей нет.
3. **Есть пользовательские инструменты + auto-tool** → в чате присутствуют все уникальные.
4. **Auto-tool неактивен/не найден** → чат создаётся, warning в лог, без 500.

---

## 8) Риски и меры

1. **Риск:** автоприкрепление увеличит число доступных tool calls в каждом чате.
   - **Мера:** инструмент лёгкий, без сети, быстрый; влияние минимально.
2. **Риск:** админ деактивирует инструмент и ожидает жёсткий отказ.
   - **Мера:** soft-fail + явный warning в логах.
3. **Риск:** потенциальная путаница UTC vs local.
   - **Мера:** явное именование полей (`*_utc`) и `timezone`.

---

## 9) План внедрения

1. Добавить built-in tool в seed.
2. Добавить executor.
3. Добавить auto-attach в `createChat`.
4. Добавить/обновить тесты.
5. Прогнать `npm run typecheck` + backend tests.
6. Выкатить, затем smoke-check:
   - создать новый чат;
   - убедиться, что среди tools есть `current-date-time`;
   - запросить у модели «сколько сейчас времени?» и проверить вызов tool в trace.

---

## 10) Критерии приёмки (Acceptance Criteria)

1. Новый инструмент `current-date-time` существует в `tool_definitions`, `is_active=true`, `is_builtin=true`.
2. Каждый вновь созданный чат содержит этот инструмент в `tool_ids`.
3. При вопросе о времени модель может вызвать tool и получить актуальный UTC timestamp.
4. Существующий функционал создания чата и запуска агента не регрессирует.

