const INITIAL_AUTH_VIEWS = ["sign-in", "sign-up", "forgot-password"] as const;

export type InitialAuthView = (typeof INITIAL_AUTH_VIEWS)[number];

export const isInitialAuthView = (value: unknown): value is InitialAuthView =>
  INITIAL_AUTH_VIEWS.some((view) => view === value);
