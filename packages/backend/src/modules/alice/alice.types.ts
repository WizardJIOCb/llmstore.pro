export interface AliceAuthorizeRequest {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  state?: string;
  scope?: string;
}

export interface OAuthTokenResponse {
  token_type: 'Bearer';
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type AliceOAuthErrorCode =
  | 'invalid_request'
  | 'unauthorized_client'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type';

export class AliceOAuthError extends Error {
  constructor(
    public code: AliceOAuthErrorCode,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = 'AliceOAuthError';
  }
}
