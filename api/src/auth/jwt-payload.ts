export type AccessTokenPayload = {
  sub: string;
  sid: string;
  typ: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: 'refresh';
};
