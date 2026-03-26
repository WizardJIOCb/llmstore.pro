import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useChatsList } from '../../hooks/useChats';
import { Button } from '../../components/ui';

const navItems = [
  { label: 'Инструменты', href: '/tools' },
  { label: 'Модели', href: '/models' },
  { label: 'Паки', href: '/packs' },
  { label: 'Локальные', href: '/local' },
  { label: 'Чаты', href: '/chats' },
  { label: 'Агенты', href: '/my/agents' },
  { label: 'RU Рынок', href: '/russian-market' },
  { label: 'Сравнение', href: '/compare' },
];

export function AppLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const isChatsPage = location.pathname.startsWith('/chats');
  const { data: chats } = useChatsList(isChatsPage && isMobileMenuOpen);

  const handleLogout = async () => {
    await logout();
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  const selectChat = (chatId: string) => {
    window.dispatchEvent(new CustomEvent('select-chat', { detail: chatId }));
    setIsMobileMenuOpen(false);
  };

  const openChatsSection = () => {
    if (!isChatsPage) {
      setIsMobileMenuOpen(false);
      navigate('/chats');
      return;
    }
    window.dispatchEvent(new CustomEvent('show-chat-list'));
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setIsMobileChatOpen(Boolean(custom.detail));
    };
    window.addEventListener('mobile-chat-active', handler as EventListener);
    return () => window.removeEventListener('mobile-chat-active', handler as EventListener);
  }, []);

  const goToMobileChatsList = () => {
    if (!isChatsPage) {
      navigate('/chats');
      return;
    }
    window.dispatchEvent(new CustomEvent('show-chat-list'));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link to="/" className="text-xl font-bold text-primary">
            LLMStore.pro
          </Link>
          <div className="md:hidden flex items-center gap-2">
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
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Открыть меню"
            >
              Меню
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              item.href === '/chats' ? (
                <button
                  key={item.href}
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={openChatsSection}
                >
                  {item.label}
                </button>
              ) : (
                <Link key={item.href} to={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              )
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Админ
                  </Link>
                )}
                <span className="text-sm text-muted-foreground">
                  <Link to="/profile" className="hover:text-foreground hover:underline transition-colors">
                    {user?.name || user?.email}
                  </Link>
                </span>
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
        <div className="fixed inset-0 z-[60] md:hidden bg-black/40" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="ml-auto h-full w-80 max-w-[85vw] bg-white border-l p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold">Меню</p>
              <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(false)}>Закрыть</Button>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                item.href === '/chats' ? (
                  <button
                    key={item.href}
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={openChatsSection}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </nav>

            {isChatsPage && (
              <div className="mt-4 border-t pt-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Список чатов</p>
                {(!chats || chats.length === 0) && (
                  <p className="text-sm text-muted-foreground">Пока нет чатов</p>
                )}
                {chats?.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => selectChat(chat.id)}
                  >
                    {chat.title}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 border-t pt-4 space-y-2">
              {isAuthenticated ? (
                <>
                  {isAdmin && (
                    <Link to="/admin" className="block rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => setIsMobileMenuOpen(false)}>
                      Админ
                    </Link>
                  )}
                  <Link to="/profile" className="block rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => setIsMobileMenuOpen(false)}>
                    {user?.name || user?.email}
                  </Link>
                  <Button className="w-full" variant="outline" size="sm" onClick={handleLogout}>Выйти</Button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}><Button className="w-full" variant="ghost" size="sm">Войти</Button></Link>
                  <Link to="/register" onClick={() => setIsMobileMenuOpen(false)}><Button className="w-full" variant="outline" size="sm">Регистрация</Button></Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} LLMStore.pro - Каталог и конструктор LLM-решений
        </div>
      </footer>
    </div>
  );
}
