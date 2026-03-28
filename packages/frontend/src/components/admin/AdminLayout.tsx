import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const adminNav = [
  { to: '/admin/dashboard', label: 'Дашборд' },
  { to: '/admin/news', label: 'Новости' },
  { to: '/admin', label: 'Статьи', exact: true },
  { to: '/admin/tools', label: 'Инструменты' },
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/agents', label: 'Агенты' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="mb-4 text-3xl font-bold">Админ-панель</h1>
        <nav className="flex gap-1 border-b">
          {adminNav.map((item) => {
            const isActive = item.exact
              ? pathname === item.to
              : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'border-b-2 -mb-px px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
