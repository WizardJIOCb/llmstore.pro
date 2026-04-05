import { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useChatsList } from '../../hooks/useChats';
import { useProfile } from '../../hooks/useProfile';
import { Button } from '../../components/ui';
import { cn, formatRub, formatUsd } from '../../lib/utils';
import { RouteTransitionShell, type RouteTransitionMode } from './RouteTransitionShell';

const DEFAULT_ROUTE_TRANSITION_MODE: RouteTransitionMode = 'soft';
const MOBILE_MENU_CLOSE_MS = 220;
const MOBILE_MENU_ITEM_STAGGER_MS = 28;

const navItems = [
  { label: 'Новости', href: '/news' },
  { label: 'Как?', href: '/guides' },
  { label: 'Планы', href: '/milestones' },
  { label: 'Галерея', href: '/gallery' },
  { label: 'Чаты', href: '/chats', requiresAuth: true },
  { label: 'Агенты', href: '/my/agents', requiresAuth: true },
  { label: 'Инструменты', href: '/tools' },
];

export function AppLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { data: profile } = useProfile(isAuthenticated);
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileMenuClosing, setIsMobileMenuClosing] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const mobileMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isChatsPage = location.pathname.startsWith('/chats');
  const { data: chats } = useChatsList(isChatsPage && isMobileMenuOpen);

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

  const handleLogout = async () => {
    closeMobileMenu();
    await logout();
    navigate('/');
  };

  const selectChat = (chatId: string) => {
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

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setIsMobileChatOpen(Boolean(custom.detail));
    };

    window.addEventListener('mobile-chat-active', handler as EventListener);
    return () => window.removeEventListener('mobile-chat-active', handler as EventListener);
  }, []);

  useEffect(() => () => clearMobileMenuTimer(), []);

  const goToMobileChatsList = () => {
    if (!isChatsPage) {
      navigate('/chats');
      return;
    }
    window.dispatchEvent(new CustomEvent('show-chat-list'));
  };

  const isNavItemActive = (href: string) => {
    if (href === '/news') return location.pathname === '/news' || location.pathname.startsWith('/news/');
    if (href === '/guides') {
      return (
        location.pathname === '/guides'
        || location.pathname.startsWith('/guides/')
        || location.pathname === '/articles'
        || location.pathname.startsWith('/article/')
      );
    }
    if (href === '/milestones') return location.pathname === '/milestones' || location.pathname.startsWith('/milestones/');
    if (href === '/tools') return location.pathname === '/tools' || location.pathname.startsWith('/tools/');
    if (href === '/gallery') return location.pathname === '/gallery' || location.pathname.startsWith('/gallery/');
    if (href === '/chats') return location.pathname.startsWith('/chats');
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
    && !location.pathname.startsWith('/shared/chats/');
  const routeTransitionKey = `${location.pathname}${location.search}${location.hash}`;
  const activeMenuClass = 'bg-[hsl(222.2deg_53.33%_74.69%_/_10%)]';
  const profileBaseLabel = user?.name || user?.email || 'Профиль';
  const profileBalanceLabel = profile
    ? `(${formatRub(profile.balance_rub, { minimumFractionDigits: 0, maximumFractionDigits: 0, symbolPosition: 'prefix' })} / ${formatUsd(profile.balance_usd)})`
    : null;
  const profileLabel = [profileBaseLabel, profileBalanceLabel].filter(Boolean).join(' ');
  const visibleNavItems = navItems.filter((item) => !item.requiresAuth || isAuthenticated);

  const mobileNavActions = visibleNavItems.map((item) => ({
    key: item.href,
    render: item.href === '/chats' ? (
      <button
        type="button"
        className={cn(
          'mobile-popover-item group flex w-full items-center justify-between rounded-[18px] border px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
          isNavItemActive(item.href)
            ? 'border-slate-200 bg-slate-100 text-slate-950'
            : 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-50 hover:text-slate-950',
        )}
        onClick={openChatsSection}
      >
        <span>{item.label}</span>
        <span className="text-xs text-slate-400 transition-transform group-hover:translate-x-0.5">↗</span>
      </button>
    ) : (
      <Link
        to={item.href}
        className={cn(
          'mobile-popover-item group flex w-full items-center justify-between rounded-[18px] border px-3.5 py-2.5 text-sm font-medium transition-colors',
          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
          isNavItemActive(item.href)
            ? 'border-slate-200 bg-slate-100 text-slate-950'
            : 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-50 hover:text-slate-950',
        )}
        onClick={closeMobileMenu}
      >
        <span>{item.label}</span>
        <span className="text-xs text-slate-400 transition-transform group-hover:translate-x-0.5">↗</span>
      </Link>
    ),
  }));

  const mobileActionDelayBase = mobileNavActions.length;
  const isMobileMenuIconOpen = isMobileMenuOpen && !isMobileMenuClosing;

  return (
    <div className={cn('min-h-screen flex flex-col', isChatsPage && 'h-screen overflow-hidden')}>
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="relative top-[-2px] inline-flex items-center gap-2.5 text-xl font-bold text-primary">
            <img
              src="/site-icon-192.png"
              alt="LLMStore.pro"
              className="h-10 w-10 object-cover shadow-sm"
            />
            <span>LLMStore.pro</span>
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            {isChatsPage && isMobileChatOpen && (
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={goToMobileChatsList}
                aria-label="Назад к списку чатов"
              >
                Назад
              </button>
            )}
            <button
              type="button"
              className={cn('header-menu-toggle', isMobileMenuIconOpen && 'is-open')}
              onClick={openMobileMenu}
              aria-label="Открыть меню"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Меню</span>
              <span className="header-menu-toggle__box" aria-hidden="true">
                <span className="header-menu-toggle__bar header-menu-toggle__bar--1" />
                <span className="header-menu-toggle__bar header-menu-toggle__bar--2" />
                <span className="header-menu-toggle__bar header-menu-toggle__bar--3" />
              </span>
            </button>
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <nav className="flex items-center gap-4">
              {visibleNavItems.map((item) => (
                item.href === '/chats' ? (
                  <button
                    key={item.href}
                    type="button"
                    className={
                      isNavItemActive(item.href)
                        ? `rounded-md ${activeMenuClass} px-[0.35rem] py-1.5 text-sm font-medium text-primary transition-colors`
                        : 'rounded-md px-[0.35rem] py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
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
                        ? `rounded-md ${activeMenuClass} px-[0.35rem] py-1.5 text-sm font-medium text-primary transition-colors`
                        : 'rounded-md px-[0.35rem] py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
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
                        ? `inline-flex max-w-[220px] flex-wrap items-center justify-center rounded-md ${activeMenuClass} px-3 py-1.5 text-center font-medium leading-tight transition-colors`
                        : 'inline-flex max-w-[220px] flex-wrap items-center justify-center rounded-md px-3 py-1.5 text-center leading-tight transition-colors hover:text-foreground hover:underline'
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
                        ? `rounded-md ${activeMenuClass} px-1.5 py-1.5 text-primary transition-colors`
                        : 'rounded-md px-1.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground'
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

      {isMobileMenuOpen && (
        <div
          className={cn(
            'fixed inset-0 z-[60] md:hidden',
            isMobileMenuClosing ? 'animate-[fadeOut_220ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeMobileMenu}
        >
          <div className="absolute inset-0 bg-[rgba(15,23,42,0.32)] backdrop-blur-[2px]" />
          <div className="mobile-popover-shell pointer-events-none absolute inset-x-3 top-3 flex justify-end">
            <div
              className={cn(
                'mobile-popover-panel pointer-events-auto w-full max-w-[21rem] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97))] p-3 shadow-[0_28px_90px_-34px_rgba(15,23,42,0.45)]',
                isMobileMenuClosing ? 'mobile-popover-panel--out' : 'mobile-popover-panel--in',
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Навигация</p>
                  <p className="mt-0.5 text-[1.6rem] font-semibold leading-none text-slate-950">Меню</p>
                </div>
                <Button variant="ghost" size="sm" onClick={closeMobileMenu}>Закрыть</Button>
              </div>

              <nav className="space-y-1.5">
                {mobileNavActions.map((item, index) => (
                  <div
                    key={item.key}
                    style={{ animationDelay: `${index * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                  >
                    {item.render}
                  </div>
                ))}
              </nav>

              {isChatsPage && (
                <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-white/75 p-3">
                  <div className="mobile-popover-item mobile-popover-item--in" style={{ animationDelay: `${mobileActionDelayBase * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Список чатов</p>
                  </div>
                  {(!chats || chats.length === 0) ? (
                    <div
                      className="mobile-popover-item mobile-popover-item--in mt-3 space-y-3"
                      style={{ animationDelay: `${(mobileActionDelayBase + 1) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
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
                    <div className="mt-2.5 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                      {chats.map((chat, index) => (
                        <button
                          key={chat.id}
                          type="button"
                          className={cn(
                            'mobile-popover-item flex w-full rounded-[18px] border border-slate-200/80 bg-white px-3 py-2 text-left text-[0.92rem] text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950',
                            isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                          )}
                          style={{ animationDelay: `${(mobileActionDelayBase + 1 + index) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                          onClick={() => selectChat(chat.id)}
                        >
                          {chat.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-slate-200/80 pt-3">
                {isAuthenticated ? (
                  <div className="space-y-1.5">
                    <div
                      className={cn(
                        'mobile-popover-item rounded-[18px] border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: `${(mobileActionDelayBase + 2) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                    >
                      {profileLabel}
                    </div>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className={cn(
                          'mobile-popover-item flex w-full rounded-[18px] border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950',
                          isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                        )}
                        style={{ animationDelay: `${(mobileActionDelayBase + 3) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                        onClick={closeMobileMenu}
                      >
                        Админ
                      </Link>
                    )}

                    <Link
                      to="/profile"
                      className={cn(
                        'mobile-popover-item flex w-full rounded-[18px] border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: `${(mobileActionDelayBase + 4) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                      onClick={closeMobileMenu}
                    >
                      Профиль
                    </Link>

                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: `${(mobileActionDelayBase + 5) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                    >
                      <Button className="w-full rounded-[18px]" variant="outline" size="sm" onClick={handleLogout}>Выйти</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: `${(mobileActionDelayBase + 2) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                    >
                      <Link to="/login" onClick={closeMobileMenu}><Button className="w-full" variant="ghost" size="sm">Войти</Button></Link>
                    </div>
                    <div
                      className={cn(
                        'mobile-popover-item',
                        isMobileMenuClosing ? 'mobile-popover-item--out' : 'mobile-popover-item--in',
                      )}
                      style={{ animationDelay: `${(mobileActionDelayBase + 3) * MOBILE_MENU_ITEM_STAGGER_MS}ms` }}
                    >
                      <Link to="/register" onClick={closeMobileMenu}><Button className="w-full" variant="outline" size="sm">Регистрация</Button></Link>
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
