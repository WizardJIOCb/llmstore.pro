import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Brain,
  CheckCircle2,
  ExternalLink,
  Headphones,
  KeyRound,
  Newspaper,
  PackageCheck,
  Rocket,
  Send,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner, Textarea } from '../../components/ui';
import { cn } from '../../lib/utils';
import {
  telegramQuickstartApi,
  type TelegramBotQuickstartPayload,
  type TelegramBotQuickstartPreset,
  type TelegramBotQuickstartResult,
} from '../../lib/api/telegramQuickstart';

interface PresetView {
  id: TelegramBotQuickstartPreset;
  title: string;
  subtitle: string;
  example: string;
  promptLabel: string;
  promptPlaceholder: string;
  sourceLabel?: string;
  sourcePlaceholder?: string;
  icon: typeof Newspaper;
}

const presets: PresetView[] = [
  {
    id: 'dtf_news',
    title: 'DTF / игровые новости',
    subtitle: 'Новости по игре, теме или ссылке на статью DTF.',
    example: 'Есть новости по Doom за неделю?',
    promptLabel: 'Дополнительные правила',
    promptPlaceholder: 'Например: отвечай очень коротко, показывай максимум 5 статей, отдельно отмечай слухи.',
    icon: Newspaper,
  },
  {
    id: 'web_news',
    title: 'Новости по теме',
    subtitle: 'Дайджест по рынку, компании, продукту или сайту.',
    example: 'Что нового по OpenAI сегодня?',
    promptLabel: 'Тема и стиль дайджеста',
    promptPlaceholder: 'Например: ищи только официальные источники и делай вывод в 4 пунктах.',
    sourceLabel: 'Приоритетный источник',
    sourcePlaceholder: 'https://example.com/news',
    icon: Sparkles,
  },
  {
    id: 'product_tracker',
    title: 'Учет товаров',
    subtitle: 'Товары, остатки, закупки и быстрые заметки.',
    example: 'Добавь: кофе | 12 пачек | полка A2',
    promptLabel: 'Как вести учет',
    promptPlaceholder: 'Например: предупреждай, если остаток меньше 3, группируй товары по полкам.',
    icon: PackageCheck,
  },
  {
    id: 'memory',
    title: 'Бот с памятью',
    subtitle: 'Запоминает факты, предпочтения и договоренности.',
    example: 'Запомни: я люблю короткие ответы',
    promptLabel: 'Как использовать память',
    promptPlaceholder: 'Например: храни идеи проектов, не смешивай личные и рабочие заметки.',
    icon: Brain,
  },
  {
    id: 'support',
    title: 'FAQ / поддержка',
    subtitle: 'Ответы клиентам по инструкции, FAQ или сайту.',
    example: 'Как оформить возврат?',
    promptLabel: 'Инструкция поддержки',
    promptPlaceholder: 'Опишите продукт, условия оплаты, возврата, доставки и тон общения.',
    sourceLabel: 'Сайт или FAQ',
    sourcePlaceholder: 'https://example.com/help',
    icon: Headphones,
  },
];

function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Yekaterinburg';
  } catch {
    return 'Asia/Yekaterinburg';
  }
}

function getApiErrorMessage(error: unknown): string {
  const maybe = error as {
    response?: {
      data?: {
        error?: {
          message?: string;
        };
      };
    };
    message?: string;
  };

  return maybe.response?.data?.error?.message || maybe.message || 'Не удалось создать Telegram-бота';
}

function presetDefaultName(preset: TelegramBotQuickstartPreset): string {
  if (preset === 'dtf_news') return 'DTF Telegram Bot';
  if (preset === 'web_news') return 'News Watch Telegram Bot';
  if (preset === 'product_tracker') return 'Product Tracker Bot';
  if (preset === 'memory') return 'Memory Telegram Bot';
  return 'Support Telegram Bot';
}

function statusLabel(status?: string | null): string {
  if (status === 'running') return 'Запущен';
  if (status === 'deploying') return 'Запускается';
  if (status === 'failed') return 'Ошибка запуска';
  if (status === 'stopped') return 'Остановлен';
  return 'Не создан';
}

export function TelegramBotQuickstartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<TelegramBotQuickstartPreset>('dtf_news');
  const [botName, setBotName] = useState(presetDefaultName('dtf_news'));
  const [telegramToken, setTelegramToken] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [result, setResult] = useState<TelegramBotQuickstartResult | null>(null);

  const preset = useMemo(
    () => presets.find((item) => item.id === selectedPreset) ?? presets[0],
    [selectedPreset],
  );

  const createMutation = useMutation({
    mutationFn: (payload: TelegramBotQuickstartPayload) => telegramQuickstartApi.create(payload),
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chats'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
        queryClient.invalidateQueries({ queryKey: ['chat-agents'] }),
      ]);
    },
  });

  const isCreating = createMutation.isPending;
  const canSubmit = telegramToken.trim().length > 20 && !isCreating;
  const errorMessage = createMutation.isError ? getApiErrorMessage(createMutation.error) : null;

  const selectPreset = (nextPreset: TelegramBotQuickstartPreset) => {
    setSelectedPreset(nextPreset);
    setBotName((current) => {
      const defaults = presets.map((item) => presetDefaultName(item.id));
      return !current.trim() || defaults.includes(current) ? presetDefaultName(nextPreset) : current;
    });
    setResult(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    createMutation.mutate({
      preset: selectedPreset,
      bot_name: botName.trim() || undefined,
      telegram_bot_token: telegramToken.trim(),
      prompt: prompt.trim() || null,
      source_url: sourceUrl.trim() || null,
      timezone: getDefaultTimezone(),
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
              <Bot className="h-4 w-4" />
              Быстрый маршрут
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              Telegram-бот из промпта за пару шагов
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Создайте бота в BotFather, вставьте токен, выберите сценарий. LLMStore сам создаст агента,
              Project Bundle, запуск и webhook callback.
            </p>
          </div>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-100"
          >
            BotFather
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="flex flex-col gap-6">
          <form className="order-2 flex flex-col gap-6" onSubmit={submit}>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-slate-950">1. Получите токен в Telegram</h2>
                <p className="text-sm leading-6 text-slate-600">
                  В BotFather нажмите Start, отправьте /newbot, выберите имя и username, затем вставьте token сюда.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">Название в LLMStore</span>
                  <Input
                    value={botName}
                    onChange={(event) => setBotName(event.target.value)}
                    placeholder="Например: DTF Telegram Bot"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <KeyRound className="h-4 w-4 text-cyan-700" />
                    Telegram bot token
                  </span>
                  <Input
                    type="password"
                    value={telegramToken}
                    onChange={(event) => {
                      setTelegramToken(event.target.value);
                      setResult(null);
                    }}
                    placeholder="123456789:AA..."
                    autoComplete="off"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-slate-950">2. Выберите, что бот должен делать</h2>
                <p className="text-sm leading-6 text-slate-600">
                  Эти сценарии сразу дают агенту правильные инструменты и поведение.
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {presets.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === selectedPreset;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectPreset(item.id)}
                      className={cn(
                        'flex min-h-[132px] flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                        active
                          ? 'border-cyan-500 bg-cyan-50 text-slate-950 shadow-[0_0_0_1px_rgba(6,182,212,0.18)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="space-y-1">
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className="block text-sm leading-5 text-slate-600">{item.subtitle}</span>
                      </span>
                      <span className="mt-auto text-xs text-slate-500">Пример: {item.example}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-slate-950">3. Настройте поведение</h2>
                <p className="text-sm leading-6 text-slate-600">
                  Это станет системной инструкцией агента, а Project Bundle будет передавать туда сообщения из Telegram.
                </p>
              </div>
              <div className="mt-4 grid gap-4">
                {preset.sourceLabel && (
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-800">{preset.sourceLabel}</span>
                    <Input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder={preset.sourcePlaceholder}
                    />
                  </label>
                )}
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">{preset.promptLabel}</span>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={preset.promptPlaceholder}
                    className="min-h-[132px]"
                  />
                </label>
              </div>

              {errorMessage && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canSubmit}
                  className="w-full whitespace-nowrap sm:w-auto sm:min-w-[230px] sm:flex-none"
                >
                  {isCreating ? <Spinner size="sm" /> : <Rocket className="h-4 w-4" />}
                  Создать и запустить
                </Button>
                <p className="text-xs leading-5 text-slate-500">
                  После старта Telegram webhook будет установлен на callback вашего Project Bundle.
                </p>
              </div>
            </section>
          </form>

          <aside className="order-1 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-cyan-700" />
                  Что получится
                </CardTitle>
                <CardDescription>
                  Один агент и один Project Bundle с понятным запуском.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Приватный агент с выбранным сценарием и инструментами.
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Python webhook server с /api/health и /webhook.
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Запуск, остановка и обновление env через Project Bundle.
                </div>
              </CardContent>
            </Card>

            {result && (
              <Card className="border-cyan-200 bg-cyan-50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Бот создан</CardTitle>
                      <CardDescription className="mt-1">
                        {result.agent.name}
                      </CardDescription>
                    </div>
                    <Badge variant={result.deployment?.status === 'running' ? 'default' : 'secondary'}>
                      {statusLabel(result.deployment?.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {result.setup_error && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Бот создан, но автозапуск/webhook требует проверки: {result.setup_error}
                    </div>
                  )}
                  {result.deployment?.webhook_url && (
                    <div className="rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                      <div className="mb-1 font-medium text-slate-800">Webhook callback</div>
                      <div className="break-all">{result.deployment.webhook_url}</div>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Button type="button" onClick={() => navigate(result.chat_url)} className="w-full">
                      Открыть чат и настройки
                    </Button>
                    <a
                      href={result.botfather_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-200 bg-white px-4 text-sm font-medium text-cyan-900 transition-colors hover:bg-cyan-100"
                    >
                      BotFather
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Маршрут</CardTitle>
                <CardDescription>
                  Самый короткий путь для нового пользователя.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="grid grid-cols-[24px_1fr] gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">1</span>
                  <span>Открыть BotFather и получить token.</span>
                </div>
                <div className="grid grid-cols-[24px_1fr] gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">2</span>
                  <span>Выбрать сценарий и добавить свои правила.</span>
                </div>
                <div className="grid grid-cols-[24px_1fr] gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">3</span>
                  <span>Запустить. Webhook ставится на callback LLMStore автоматически.</span>
                </div>
                <Link
                  to="/my/agents"
                  className="inline-flex items-center gap-2 pt-1 text-sm font-medium text-cyan-700 hover:text-cyan-900"
                >
                  Мои агенты
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
