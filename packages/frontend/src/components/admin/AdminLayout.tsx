import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const adminNav = [
  { to: '/admin', label: 'Каталог', exact: true },
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/agents', label: 'Агенты' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">Админ-панель</h1>
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
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
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
