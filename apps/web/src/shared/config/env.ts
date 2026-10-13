export const env = {
  trpcUrl: import.meta.env.VITE_TRPC_URL ?? '/trpc',
} as const;
