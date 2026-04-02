import { Link } from 'react-router-dom';

interface UserLinkProps {
  username?: string | null;
  name?: string | null;
  fallback?: string;
  className?: string;
  withAtWhenUsernameOnly?: boolean;
}

export function UserLink({
  username,
  name,
  fallback = 'Пользователь',
  className,
  withAtWhenUsernameOnly = true,
}: UserLinkProps) {
  const trimmedUsername = username?.trim().replace(/^@+/, '') || '';
  const trimmedName = name?.trim() || '';
  const label = trimmedName || (trimmedUsername ? `${withAtWhenUsernameOnly ? '@' : ''}${trimmedUsername}` : fallback);

  if (!trimmedUsername) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Link
      to={`/u/${encodeURIComponent(trimmedUsername)}`}
      className={className}
      title={`Открыть профиль @${trimmedUsername}`}
    >
      {label}
    </Link>
  );
}
