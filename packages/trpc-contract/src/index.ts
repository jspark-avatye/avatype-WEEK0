import { initTRPC } from '@trpc/server';

export type RpcController = {
  health(): { status: 'ok' } | Promise<{ status: 'ok' }>;
};

export type RpcContext = { controller: RpcController };
const t = initTRPC.context<RpcContext>().create();

/** Procedures route to the Nest controller supplied by the inbound adapter. */
export const appRouter = t.router({
  health: t.procedure.query(({ ctx }) => ctx.controller.health()),
});

export type AppRouter = typeof appRouter;
