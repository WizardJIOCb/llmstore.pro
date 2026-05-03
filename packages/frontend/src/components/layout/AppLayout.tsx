import { useEffect, useRef, useState } from 'react';
import { Menu, Shield } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useChatsList } from '../../hooks/useChats';
import { useProfile } from '../../hooks/useProfile';
import { Button } from '../../components/ui';
import { cn, formatRub, formatUsd } from '../../lib/utils';
import { RouteTransitionShell, type RouteTransitionMode } from './RouteTransitionShell';
import { authApi } from '../../lib/api/auth';

const DEFAULT_ROUTE_TRANSITION_MODE: RouteTransitionMode = 'soft';
const MOBILE_MENU_CLOSE_MS = 220;
const MOBILE_MENU_ITEM_STAGGER_MS = 28;
const MOBILE_MENU_ITEM_MAX_DELAY_MS = 280;
const LAST_CHAT_SELECTION_STORAGE_KEY = 'llmstore.last-chat-selection';

function hasPersistedActiveChat(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = window.localStorage.getItem(LAST_CHAT_SELECTION_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as { activeChatId?: unknown };
    return typeof parsed.activeChatId === 'string' && parsed.activeChatId.trim().length > 0;
  } catch {
    return false;
  }
}

const navItems = [
  { label: 'Новости', href: '/news' },
  { label: 'Статьи', href: '/articles' },
  { label: 'Планы', href: '/milestones' },
  { label: 'Галерея', href: '/gallery' },
  { label: 'Чаты', href: '/chats' },
  { label: 'Telegram', href: '/builder/telegram-bot', requiresAuth: true },
  { label: 'Агенты', href: '/my/agents', requiresAuth: true },
];

export function AppLayout() {
  const { user, isAuthenticated, isAdmin, logout, fetchMe } = useAuth();
  const { data: profile } = useProfile(isAuthenticated);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const outlet = useOutlet();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileMenuClosing, setIsMobileMenuClosing] = useState(false);
  const [showAnimatedLogo, setShowAnimatedLogo] = useState(true);
  const [logoPlaybackNonce, setLogoPlaybackNonce] = useState(0);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(
    () => window.location.pathname.startsWith('/chats') && hasPersistedActiveChat(),
  );
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isChatsPage = location.pathname.startsWith('/chats');
  const { data: chats } = useChatsList(isAuthenticated);

  const clearMobileMenuTimer = () => {
    if (mobileMenuTimerRef.current) {
      clearTimeout(mobileMenuTimerRef.current);
      mobileMenuTimerRef.current = null;
    }
  };

  const openMobileMenu = () => {
    clearMobileMenuTimer();
    setIsMobileMenuClosing(false);
    setIsMobileMenuOpen(true);
    requestAnimationFrame(() => mobileMenuButtonRef.current?.blur());
  };

  const closeMobileMenu = () => {
    clearMobileMenuTimer();
    setIsMobileMenuClosing(true);
    mobileMenuTimerRef.current = setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsMobileMenuClosing(false);
      mobileMenuTimerRef.current = null;
    }, MOBILE_MENU_CLOSE_MS);
  };

  const dismissMobileMenuImmediately = () => {
    clearMobileMenuTimer();
    setIsMobileMenuOpen(false);
    setIsMobileMenuClosing(false);
  };

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen && !isMobileMenuClosing) {
      closeMobileMenu();
      return;
    }

    openMobileMenu();
  };

  const handleLogout = async () => {
    closeMobileMenu();
    await logout();
    navigate('/');
  };

  const navigateFromMobileMenu = (href: string) => {
    dismissMobileMenuImmediately();
    navigate(href);
  };

  const selectChat = (chatId: string) => {
    if (!isChatsPage) {
      closeMobileMenu();
      navigate(`/chats?chat=${chatId}`);
      return;
    }

    window.dispatchEvent(new CustomEvent('select-chat', { detail: chatId }));
    closeMobileMenu();
  };

  const emitOpenCreateChat = () => {
    window.dispatchEvent(new CustomEvent('open-create-chat'));
  };

  const openChatsSection = () => {
    if (!isChatsPage) {
      closeMobileMenu();
      navigate('/chats');
      return;
    }
    if (isMobileChatOpen) {
      window.dispatchEvent(new CustomEvent('scroll-chat-to-bottom'));
      closeMobileMenu();
      return;
    }
    window.dispatchEvent(new CustomEvent('show-chat-list'));
    closeMobileMenu();
  };

  const openMobileChatsSection = () => {
    if (!isChatsPage) {
      closeMobileMenu();
      navigate('/chats');
      return;
    }

    window.dispatchEvent(new CustomEvent('show-chat-list'));
    closeMobileMenu();
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setIsMobileChatOpen(Boolean(custom.detail));
    };

    window.addEventListener('mobile-chat-active', handler as EventListener);
    return () => window.removeEventListener('mobile-chat-active', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!isChatsPage) {
      setIsMobileChatOpen(false);
      return;
    }

    if (hasPersistedActiveChat()) {
      setIsMobileChatOpen(true);
    }
  }, [isChatsPage, location.key]);

  useEffect(() => () => clearMobileMenuTimer(), []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    closeMobileMenu();
  }, [location.pathname, location.search]);

  const goToMobileChatsList = () => {
    if (isMobileMenuOpen && !isMobileMenuClosing) {
      closeMobileMenu();
    }

    try {
      window.localStorage.removeItem(LAST_CHAT_SELECTION_STORAGE_KEY);
    } catch {
      // Ignore storage issues and still return to the chat list.
    }

    if (!isChatsPage) {
      navigate('/chats');
      return;
    }
    window.dispatchEvent(new CustomEvent('show-chat-list'));
  };

  const isNavItemActive = (href: string) => {
    if (href === '/news') return location.pathname === '/news' || location.pathname.startsWith('/news/');
    if (href === '/articles') {
      return (
        location.pathname === '/articles'
        || location.pathname.startsWith('/articles/')
        || location.pathname.startsWith('/article/')
        || location.pathname === '/guides'
        || location.pathname.startsWith('/guides/')
      );
    }
    if (href === '/guides') {
      return (
        location.pathname === '/guides'
        || location.pathname.startsWith('/guides/')
      );
    }
    if (href === '/milestones') return location.pathname === '/milestones' || location.pathname.startsWith('/milestones/');
    if (href === '/tools') return location.pathname === '/tools' || location.pathname.startsWith('/tools/');
    if (href === '/gallery') return location.pathname === '/gallery' || location.pathname.startsWith('/gallery/');
    if (href === '/chats') return location.pathname.startsWith('/chats');
    if (href === '/builder/telegram-bot') return location.pathname.startsWith('/builder/telegram-bot');
    if (href === '/my/agents') {
      return (
        location.pathname.startsWith('/my/agents')
        || location.pathname.startsWith('/playground/agent/')
        || location.pathname.startsWith('/builder/agent')
      );
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  const isProfileActive = location.pathname === '/profile' || location.pathname.startsWith('/profile/');
  const isAdminActive = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const shouldAnimateRouteContent = !location.pathname.startsWith('/shared/chat/')
    && !location.pathname.startsWith('/shared/chats/')
    && !location.pathname.startsWith('/admin');
  const routeTransitionKey = location.pathname === '/my/agents'
    ? `${location.pathname}${location.hash}`
    : `${location.pathname}${location.search}${location.hash}`;
  const activeMenuClass = 'bg-[hsl(222.2deg_53.33%_74.69%_/_10%)]';
  const profileBaseLabel = user?.name || user?.email || 'Профиль';
  const compactHeaderRubBalance = profile
    ? formatRub(profile.balance_rub, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      symbolPosition: 'prefix',
    }).replace(/[\s\u00A0\u202F]/g, '')
    : null;
  const profileBalanceLabel = profile
    ? `(${compactHeaderRubBalance} / ${formatUsd(profile.balance_usd)})`
    : null;
  const profileLabel = [profileBaseLabel, profileBalanceLabel].filter(Boolean).join(' ');
  const visibleNavItems = navItems.filter((item) => !item.requiresAuth || isAuthenticated);
  const mobileChatsCountLabel = `Чаты: ${chats?.length ?? 0}`;

  const isImpersonating = user?.impersonation?.is_impersonating === true;

  const handleStopImpersonation = async () => {
    await authApi.stopImpersonation();
    queryClient.clear();
    await fetchMe();
    navigate('/admin/users');
  };

  const restartLogoAnimation = () => {
    setShowAnimatedLogo(true);
    setLogoPlaybackNonce((current) => current + 1);
  };

  const getMobileMenuAnimationDelay = (index: number) => `${Math.min(index * MOBILE_MENU_ITEM_STAGGER_MS, MOBILE_MENU_ITEM_MAX_DELAY_MS)}ms`;

  const mobileNavActions = visibleNavItems.map((item, index) => ({
    key: item.href,
    render: item.href === '/chats' ? (
      <button
        type="button"
        onClick={openMobileChatsSection}
        className={cn(
          'mobile-popover-item flex w-full touch-manipulation items-center justify-between rounded-[18px] border px-3 py-2.5 text-left text-[0.98rem] font-medium leading-tight tracking-[-0.015em] transition-all',
          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
          isNavItemActive(item.href)
            ? 'border-cyan-300/60 bg-[linear-gradient(135deg,rgba(16,24,40,0.95),rgba(16,40,48,0.92))] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_0_34px_rgba(45,212,191,0.22)]'
            : 'border-transparent bg-transparent text-white/88 active:text-white',
        )}
        style={{ animationDelay: getMobileMenuAnimationDelay(index) }}
      >
        <span>{item.label}</span>
        <span className="text-xs text-slate-400">↗</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => navigateFromMobileMenu(item.href)}
        className={cn(
          'mobile-popover-item flex w-full touch-manipulation items-center justify-between rounded-[18px] border px-3 py-2.5 text-[0.98rem] font-medium leading-tight tracking-[-0.015em] transition-all',
          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
          isNavItemActive(item.href)
            ? 'border-cyan-300/60 bg-[linear-gradient(135deg,rgba(16,24,40,0.95),rgba(16,40,48,0.92))] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_0_34px_rgba(45,212,191,0.22)]'
            : 'border-transparent bg-transparent text-white/88 active:text-white',
        )}
        style={{ animationDelay: getMobileMenuAnimationDelay(index) }}
      >
        <span>{item.label}</span>
        <span className="text-xs text-slate-400">↗</span>
      </button>
    ),
  }));

  const mobileActionDelayBase = mobileNavActions.length;
  const isMobileMenuIconOpen = isMobileMenuOpen && !isMobileMenuClosing;

  return (
    <div className={cn('min-h-screen flex flex-col', isChatsPage && 'h-screen overflow-hidden')}>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white md:border-slate-200 md:bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.18),transparent_34%),linear-gradient(135deg,#0b1220,#111827_58%,#0f172a)] px-4 text-white md:bg-none md:text-inherit">
          <Link
            to="/"
            className="relative top-[-2px] inline-flex items-center gap-2.5 text-xl font-bold text-white md:text-primary"
            onClick={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest('[data-logo-media="true"]')) {
                restartLogoAnimation();
              }
            }}
          >
            <span
              data-logo-media="true"
              className="h-9 w-9 overflow-hidden rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.12)] md:h-[40px] md:w-[39px] md:rounded-none"
              aria-hidden="true"
            >
              {showAnimatedLogo ? (
                <video
                  key={logoPlaybackNonce}
                  className="h-full w-full scale-x-[1.03] object-cover"
                  src="/llm-store-preview-logo-v4.mp4"
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  onEnded={() => setShowAnimatedLogo(false)}
                  onError={() => setShowAnimatedLogo(false)}
                />
              ) : (
                <img
                  className="h-full w-full object-cover"
                  src="/site-icon-192.png"
                  alt=""
                />
              )}
            </span>
            <span className="tracking-[-0.04em]">LLMStore.pro</span>
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            {isChatsPage && isMobileChatOpen && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/45 bg-[linear-gradient(135deg,rgba(12,20,34,0.96),rgba(15,32,44,0.9))] px-4 py-2 text-sm font-semibold tracking-[-0.02em] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_0_28px_rgba(45,212,191,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform active:scale-[0.98]"
                onClick={goToMobileChatsList}
                aria-label="Назад к списку чатов"
              >
                Назад
              </button>
            )}
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="inline-flex touch-manipulation items-center gap-2 rounded-full border border-cyan-300/45 bg-[linear-gradient(135deg,rgba(12,20,34,0.96),rgba(15,32,44,0.9))] px-4 py-2 text-lg font-semibold tracking-[-0.02em] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_0_28px_rgba(45,212,191,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform active:scale-[0.98]"
              onClick={toggleMobileMenu}
              aria-label="Открыть меню"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Меню</span>
              <Menu className="h-5 w-5 text-cyan-200" />
              <span aria-hidden="true">Меню</span>
            </button>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <nav className="flex items-center gap-3">
              {visibleNavItems.map((item) => (
                item.href === '/chats' ? (
                  <button
                    key={item.href}
                    type="button"
                    className={
                      isNavItemActive(item.href)
                        ? `rounded-md ${activeMenuClass} px-3 py-1.5 text-sm font-medium text-primary transition-colors`
                        : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
                    }
                    onClick={openChatsSection}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={
                      isNavItemActive(item.href)
                        ? `rounded-md ${activeMenuClass} px-3 py-1.5 text-sm font-medium text-primary transition-colors`
                        : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
                    }
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </nav>

            {isAuthenticated ? (
              <>
                <span className={isProfileActive ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}>
                  <Link
                    to="/profile"
                    className={
                      isProfileActive
                        ? `inline-flex max-w-[220px] items-center justify-center whitespace-nowrap rounded-md ${activeMenuClass} px-3 py-1.5 text-center font-medium leading-tight transition-colors`
                        : 'inline-flex max-w-[220px] items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-center leading-tight transition-colors hover:text-foreground hover:underline'
                    }
                  >
                    <span>{profileBaseLabel}</span>
                    {profileBalanceLabel && <span className="inline-block sm:ml-1">{profileBalanceLabel}</span>}
                  </Link>
                </span>

                {isAdmin && (
                  <Link
                    to="/admin"
                    aria-label="Админ"
                    title="Админ"
                    className={
                      isAdminActive
                        ? `-mx-1 rounded-md ${activeMenuClass} px-0 py-1.5 text-primary transition-colors`
                        : '-mx-1 rounded-md px-0 py-1.5 text-muted-foreground transition-colors hover:text-foreground'
                    }
                  >
                    <Shield className="h-4 w-4" />
                  </Link>
                )}

                <Button variant="ghost" size="sm" onClick={handleLogout}>Выйти</Button>
              </>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Войти</Button></Link>
                <Link to="/register"><Button variant="outline" size="sm">Регистрация</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {isImpersonating && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="container mx-auto flex flex-col gap-3 px-4 py-3 text-sm text-amber-950 md:flex-row md:items-center md:justify-between">
            <div>
              <strong>Вы авторизованы за другого пользователя.</strong> Сейчас можно смотреть его чаты и профиль от его имени.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 bg-white hover:bg-amber-100"
              onClick={handleStopImpersonation}
            >
              Вернуться в админа
            </Button>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 top-16 z-40 md:hidden',
            isMobileMenuClosing ? 'animate-[fadeOut_220ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeMobileMenu}
        >
          <div className="absolute inset-0 bg-[rgba(3,7,18,0.72)] backdrop-blur-[10px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(45,212,191,0.2),transparent_24%),radial-gradient(circle_at_72%_54%,rgba(103,232,249,0.14),transparent_22%),radial-gradient(circle_at_38%_70%,rgba(255,255,255,0.08),transparent_14%),radial-gradient(circle_at_64%_78%,rgba(255,255,255,0.08),transparent_12%),linear-gradient(180deg,rgba(7,12,24,0.96),rgba(6,10,20,0.98))]" />
          <div className="mobile-popover-shell absolute inset-x-0 top-0 flex justify-end">
            <div
              className={cn(
                'mobile-popover-panel h-full w-full touch-manipulation overflow-y-auto border-t border-white/10 bg-transparent px-4 pb-4 pt-3 text-white [&_p]:text-white/80 [&_a]:text-white [&_button]:text-white',
                isMobileMenuClosing ? 'mobile-popover-panel--out' : 'mobile-popover-panel--in',
              )}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3 text-white">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Навигация</p>
                  <p className="mt-0.5 text-[1.6rem] font-semibold leading-none text-slate-950">Меню</p>
                </div>
                <Button variant="ghost" size="sm" onClick={closeMobileMenu}>Закрыть</Button>
              </div>

              <nav className="max-w-[24rem] space-y-1">
                {mobileNavActions.map((item, index) => (
                  <div
                    key={item.key}
                    style={{ animationDelay: `${index * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                  >
                    {item.render}
                  </div>
                ))}
              </nav>

              {isAuthenticated && (
                <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="mobile-popover-item mobile-popover-item--in" style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase) }}>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{mobileChatsCountLabel}</p>
                  </div>
                  {(!chats || chats.length === 0) ? (
                    <div
                      className="mobile-popover-item mobile-popover-item--in mt-2 space-y-2"
                      style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 1) }}
                    >
                      <p className="text-sm text-slate-600">Пока нет чатов</p>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => {
                          closeMobileMenu();
                          if (!isChatsPage) {
                            navigate('/chats');
                            setTimeout(emitOpenCreateChat, MOBILE_MENU_CLOSE_MS - 20);
                            return;
                          }
                          setTimeout(emitOpenCreateChat, MOBILE_MENU_CLOSE_MS - 20);
                        }}
                      >
                        Создать новый чат
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 max-h-[10.5rem] space-y-1 overflow-y-auto pr-1">
                      {chats.map((chat, index) => (
                        <button
                          key={chat.id}
                          type="button"
                          className={cn(
                            'mobile-popover-item flex min-h-[2.4rem] w-full touch-manipulation items-center rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[0.92rem] leading-tight text-white/78 transition-colors active:bg-white/[0.06] active:text-white',
                            isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                          )}
                          style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 1 + index) }}
                          onClick={() => selectChat(chat.id)}
                        >
                          <span className="block min-w-0 truncate whitespace-nowrap">
                            {chat.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-white/12 pt-4">
                {isAuthenticated ? (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => navigateFromMobileMenu('/profile')}
                      className={cn(
                        'mobile-popover-item block touch-manipulation rounded-[18px] border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(12,20,34,0.78),rgba(15,32,44,0.62))] px-3.5 py-2.5 text-sm font-medium text-cyan-100 transition-colors active:border-cyan-300/40 active:text-white',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 2) }}
                    >
                      {profileLabel}
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => navigateFromMobileMenu('/admin')}
                        className={cn(
                          'mobile-popover-item flex w-full touch-manipulation rounded-[18px] border border-transparent px-3 py-2.5 text-[0.98rem] font-medium leading-tight tracking-[-0.015em] text-white/82 transition-colors active:text-white',
                          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                        )}
                        style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 3) }}
                      >
                        Админ
                      </button>
                    )}

                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 4) }}
                    >
                      <Button className="w-full rounded-[18px] border-cyan-300/35 bg-[linear-gradient(135deg,rgba(12,20,34,0.94),rgba(15,32,44,0.88))] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_0_22px_rgba(45,212,191,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-cyan-300/50 hover:bg-[linear-gradient(135deg,rgba(16,26,42,0.98),rgba(18,40,54,0.94))] hover:text-white" variant="outline" size="sm" onClick={handleLogout}>Выйти</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 2) }}
                    >
                      <Button
                        className="w-full rounded-[18px] border border-white/12 bg-[linear-gradient(135deg,rgba(12,20,34,0.82),rgba(15,32,44,0.68))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-cyan-300/28 hover:bg-[linear-gradient(135deg,rgba(16,26,42,0.94),rgba(18,40,54,0.88))] hover:text-white"
                        variant="outline"
                        size="sm"
                        onClick={() => navigateFromMobileMenu('/login')}
                      >
                        Войти
                      </Button>
                    </div>
                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: getMobileMenuAnimationDelay(mobileActionDelayBase + 3) }}
                    >
                      <Button
                        className="w-full rounded-[18px] border-cyan-300/35 bg-[linear-gradient(135deg,rgba(12,20,34,0.94),rgba(15,32,44,0.88))] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_0_22px_rgba(45,212,191,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-cyan-300/50 hover:bg-[linear-gradient(135deg,rgba(16,26,42,0.98),rgba(18,40,54,0.94))] hover:text-white"
                        variant="outline"
                        size="sm"
                        onClick={() => navigateFromMobileMenu('/register')}
                      >
                        Регистрация
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className={cn('flex-1', isChatsPage && 'min-h-0 overflow-hidden')}>
        {shouldAnimateRouteContent ? (
          <RouteTransitionShell
            routeKey={routeTransitionKey}
            enabled={shouldAnimateRouteContent}
            mode={DEFAULT_ROUTE_TRANSITION_MODE}
          >
            {outlet}
          </RouteTransitionShell>
        ) : (
          outlet
        )}
      </main>

      {!isChatsPage && (
        <footer className="border-t bg-white py-8">
          <div className="container mx-auto space-y-4 px-4 text-center text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Link to="/pricing" className="hover:text-foreground hover:underline">Оплата и тарифы</Link>
              <Link to="/offer" className="hover:text-foreground hover:underline">Оферта</Link>
              <Link to="/contacts" className="hover:text-foreground hover:underline">Контакты и реквизиты</Link>
            </div>
            <div>
              &copy; {new Date().getFullYear()} LLMStore.pro - Каталог и конструктор LLM-решений
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

