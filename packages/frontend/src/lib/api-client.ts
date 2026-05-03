import axios from 'axios';

const PROTECTED_ROUTE_PREFIXES = [
  '/my/agents',
  '/builder/agent',
  '/builder/telegram-bot',
  '/playground/agent',
  '/profile',
  '/dashboard',
  '/admin',
];

function isProtectedUiPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = String(error.config?.url ?? '');
      const isAuthMeRequest = requestUrl.includes('/auth/me');
      const { pathname } = window.location;
      const isPublicSharedPage = pathname.startsWith('/shared/chat/') || pathname.startsWith('/shared/chats/');
      const shouldForceLogin = isProtectedUiPath(pathname);

      // Do not force-login on expected 401s:
      // - /auth/me for guests
      // - public shared chat pages
      // - any public page where a protected request can fail in background
      if (!isAuthMeRequest && !isPublicSharedPage && shouldForceLogin && pathname !== '/login' && pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
