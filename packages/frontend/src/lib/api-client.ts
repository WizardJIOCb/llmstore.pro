import axios from 'axios';

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

      // Do not force-login on expected 401s:
      // - /auth/me for guests
      // - public shared chat pages
      if (!isAuthMeRequest && !isPublicSharedPage && pathname !== '/login' && pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
