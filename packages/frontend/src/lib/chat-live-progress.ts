export interface LiveProgressPayload {
  run_id?: string;
  label?: string;
  detail?: string;
  status?: string;
  tool_name?: string;
  tool_call_id?: string;
  input?: unknown;
  output?: unknown;
  duration_ms?: number;
  ts?: string;
  error?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: string;
  charged_cost?: string;
  usd_to_rub_rate?: number;
  balance_after_usd?: string;
}

export interface LiveProgressEvent extends LiveProgressPayload {
  id: string;
  event: string;
  label: string;
}

const EVENT_LABELS: Record<string, string> = {
  'chat.message.accepted': 'Сообщение принято',
  'chat.message.completed': 'Ответ сохранён',
  'chat.run.started': 'Запускаю выполнение',
  'chat.run.tool.started': 'Запускаю инструмент',
  'chat.run.tool.finished': 'Инструмент завершил шаг',
  'chat.run.completed': 'Выполнение завершено',
  'chat.run.failed': 'Выполнение завершилось с ошибкой',
  'chat.run.skipped': 'Выполнение пропущено',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  running: 'В работе',
  completed: 'Завершено',
  failed: 'Ошибка',
  cancelled: 'Остановлено',
  continuing_output: 'Продолжаю длинный ответ',
};

const CONTINUING_OUTPUT_LABEL = 'Продолжаю собирать длинный ответ';
const CONTINUING_OUTPUT_DETAIL = 'Ответ не помещается в один проход, поэтому автоматически запрашиваю следующий фрагмент и аккуратно достраиваю результат.';

function isRawMachineLabel(value: string | undefined, eventName: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (trimmed === eventName) return true;
  return /^[a-z0-9_.:/-]+$/i.test(trimmed);
}

function getDisplayStatus(status: string | undefined, eventName: string): string | undefined {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (eventName === 'chat.run.status' && normalized === 'continuing_output') {
    return undefined;
  }
  return STATUS_LABELS[normalized] ?? status?.trim();
}

export function getLiveProgressLabel(eventName: string, payload: LiveProgressPayload): string {
  const normalizedStatus = payload.status?.trim().toLowerCase();
  if (normalizedStatus === 'continuing_output') {
    return CONTINUING_OUTPUT_LABEL;
  }

  if (!isRawMachineLabel(payload.label, eventName)) {
    return payload.label!.trim();
  }

  if (EVENT_LABELS[eventName]) {
    return EVENT_LABELS[eventName];
  }

  if (normalizedStatus && STATUS_LABELS[normalizedStatus]) {
    return STATUS_LABELS[normalizedStatus];
  }

  return payload.label?.trim() || eventName;
}

function getLiveProgressDetail(eventName: string, payload: LiveProgressPayload): string | undefined {
  const normalizedStatus = payload.status?.trim().toLowerCase();
  if (normalizedStatus === 'continuing_output') {
    return CONTINUING_OUTPUT_DETAIL;
  }

  const detail = payload.detail?.trim();
  if (detail) return detail;

  if (!isRawMachineLabel(payload.label, eventName)) {
    return undefined;
  }

  return undefined;
}

export function createLiveProgressEvent(
  eventName: string,
  payload: LiveProgressPayload,
  indexSeed: number,
): LiveProgressEvent {
  return {
    id: `${eventName}-${payload.ts ?? Date.now()}-${indexSeed}`,
    event: eventName,
    label: getLiveProgressLabel(eventName, payload),
    detail: getLiveProgressDetail(eventName, payload),
    status: getDisplayStatus(payload.status, eventName),
    tool_name: payload.tool_name?.trim() || undefined,
    tool_call_id: payload.tool_call_id?.trim() || undefined,
    input: payload.input,
    output: payload.output,
    duration_ms: payload.duration_ms,
    ts: payload.ts,
    error: payload.error,
    prompt_tokens: payload.prompt_tokens,
    completion_tokens: payload.completion_tokens,
    total_tokens: payload.total_tokens,
    estimated_cost: payload.estimated_cost,
    charged_cost: payload.charged_cost,
    usd_to_rub_rate: payload.usd_to_rub_rate,
  };
}

function shouldMergeLiveProgressEvents(previous: LiveProgressEvent | undefined, next: LiveProgressEvent): boolean {
  if (!previous) return false;

  return previous.event === 'chat.run.status'
    && next.event === 'chat.run.status'
    && previous.label === CONTINUING_OUTPUT_LABEL
    && next.label === CONTINUING_OUTPUT_LABEL;
}

export function appendLiveProgressEvent(
  previousEvents: LiveProgressEvent[],
  nextEvent: LiveProgressEvent,
): LiveProgressEvent[] {
  if (shouldMergeLiveProgressEvents(previousEvents[previousEvents.length - 1], nextEvent)) {
    const merged = {
      ...previousEvents[previousEvents.length - 1],
      ...nextEvent,
      id: previousEvents[previousEvents.length - 1].id,
    };
    return [...previousEvents.slice(0, -1), merged];
  }

  return [...previousEvents.slice(-47), nextEvent];
}
