import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
    oauthState?: string;
    oauthMode?: 'login' | 'link';
    oauthCodeVerifier?: string;
  }
}
