import 'express-session';
import type { AliceAuthorizeRequest } from '../modules/alice/alice.types.js';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
    lastActivityTrackedAt?: string;
    impersonatorUserId?: string;
    impersonatorUserRole?: string;
    oauthState?: string;
    oauthMode?: 'login' | 'link';
    oauthCodeVerifier?: string;
    oauthDeviceFingerprint?: string;
    oauthNextPath?: string;
    oauthMobileRedirectUri?: string;
    aliceAuthorizeRequest?: AliceAuthorizeRequest;
  }
}
