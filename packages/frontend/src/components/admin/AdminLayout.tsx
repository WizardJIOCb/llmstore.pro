import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const adminNav = [
  { to: '/admin/dashboard', label: 'Дашборд' },
  { to: '/admin/charts', label: 'Графики' },
  { to: '/admin/settings', label: 'Настройки' },
  { to: '/admin/news', label: 'Новости' },
  { to: '/admin', label: 'Каталог', exact: true },
  { to: '/admin/articles', label: 'Статьи' },
  { to: '/admin/tools', label: 'Инструменты' },
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/agents', label: 'Агенты' },
  { to: '/admin/runtimes', label: 'RunTime' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="container mx-auto w-full px-4 py-8">
      <div className="mb-6">
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-950">Админ-панель</h1>
        <nav className="flex flex-wrap gap-x-1 gap-y-2 border-b border-slate-200 pb-px">
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
                    ? 'border-slate-950 text-slate-950'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900',
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
