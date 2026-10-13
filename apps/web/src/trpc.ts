import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@root/trpc-contract';

export const trpc = createTRPCReact<AppRouter>();
