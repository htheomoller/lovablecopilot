export const DEV_ROUTES = ['/health', '/self-test'] as const;

export type DevRoute = typeof DEV_ROUTES[number];