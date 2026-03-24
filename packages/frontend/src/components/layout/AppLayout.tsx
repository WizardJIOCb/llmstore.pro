import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui';

const navItems = [
  { label: 'Инструменты', href: '/tools' },
  { label: 'Модели', href: '/models' },
  { label: 'Паки', href: '/packs' },
  { label: 'Локальные', href: '/local' },
  { label: 'Агенты', href: '/my/agents' },
  { label: 'Ассеты', href: '/assets' },
  { label: 'RU Рынок', href: '/russian-market' },
  { label: 'Сравнение', href: '/compare' },
];

export function AppLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link to="/" className="text-xl font-bold text-primary">
            LLMStore.pro
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Админ
                  </Link>
                )}
                <span className="text-sm text-muted-foreground">
                  <Link to="/profile" className="hover:text-foreground hover:underline transition-colors">
                    {user?.name || user?.email}
                  </Link>
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Выйти
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Войти</Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" size="sm">Регистрация</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} LLMStore.pro — Каталог и конструктор LLM-решений
        </div>
      </footer>
    </div>
  );
}
