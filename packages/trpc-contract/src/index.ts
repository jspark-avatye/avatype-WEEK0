import { TRPCError, initTRPC } from '@trpc/server';

export type PublicUser = {
  userId: string;
  loginId: string;
  currentLevelCode: string | null;
};

export type SignupInput = {
  loginId: string;
  password: string;
  passwordConfirm: string;
};

export type LoginInput = Pick<SignupInput, 'loginId' | 'password'>;

type IssuedAuth = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

type RefreshedAuth = Omit<IssuedAuth, 'user'>;

export type AuthRpcController = {
  signup(input: SignupInput): Promise<IssuedAuth>;
  login(input: LoginInput): Promise<IssuedAuth>;
  me(userId: string): Promise<PublicUser>;
  refresh(refreshToken: string | undefined): Promise<RefreshedAuth>;
  logout(refreshToken: string | undefined): Promise<void>;
  verifyAccess(authorization: string | undefined): Promise<string>;
};

export type RpcController = {
  health(): { status: 'ok' } | Promise<{ status: 'ok' }>;
  auth: AuthRpcController;
};

export type RpcContext = {
  controller: RpcController;
  origin: string | undefined;
  webOrigin: string;
  authorization: string | undefined;
  refreshToken: string | undefined;
  setRefreshCookie(token: string, expiresAt: Date): void;
  clearRefreshCookie(): void;
};

const t = initTRPC.context<RpcContext>().create();

function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '입력값을 확인해 주세요.' });
  }
  return value as Record<string, unknown>;
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '입력값을 확인해 주세요.' });
  }
  return value;
}

function parseSignup(value: unknown): SignupInput {
  const input = objectInput(value);
  return {
    loginId: stringField(input, 'loginId'),
    password: stringField(input, 'password'),
    passwordConfirm: stringField(input, 'passwordConfirm'),
  };
}

function parseLogin(value: unknown): LoginInput {
  const input = objectInput(value);
  return { loginId: stringField(input, 'loginId'), password: stringField(input, 'password') };
}

const sameOrigin = t.middleware(({ ctx, next }) => {
  if (ctx.origin !== ctx.webOrigin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '허용되지 않은 요청입니다.' });
  }
  return next();
});

const protectedAccess = t.middleware(async ({ ctx, next }) => {
  const userId = await ctx.controller.auth.verifyAccess(ctx.authorization);
  return next({ ctx: { userId } });
});

const authMutation = t.procedure.use(sameOrigin);

/** Procedures invoke Nest controllers supplied by the HTTP inbound adapter. */
export const appRouter = t.router({
  health: t.procedure.query(({ ctx }) => ctx.controller.health()),
  auth: t.router({
    signup: authMutation.input(parseSignup).mutation(async ({ ctx, input }) => {
      const result = await ctx.controller.auth.signup(input);
      ctx.setRefreshCookie(result.refreshToken, result.refreshExpiresAt);
      return { user: result.user, accessToken: result.accessToken };
    }),
    login: authMutation.input(parseLogin).mutation(async ({ ctx, input }) => {
      const result = await ctx.controller.auth.login(input);
      ctx.setRefreshCookie(result.refreshToken, result.refreshExpiresAt);
      return { user: result.user, accessToken: result.accessToken };
    }),
    me: t.procedure.use(protectedAccess).query(({ ctx }) => ctx.controller.auth.me(ctx.userId)),
    refresh: authMutation.mutation(async ({ ctx }) => {
      try {
        const result = await ctx.controller.auth.refresh(ctx.refreshToken);
        ctx.setRefreshCookie(result.refreshToken, result.refreshExpiresAt);
        return { accessToken: result.accessToken };
      } catch (error) {
        if (error instanceof TRPCError && error.code === 'UNAUTHORIZED') ctx.clearRefreshCookie();
        throw error;
      }
    }),
    logout: authMutation.mutation(async ({ ctx }) => {
      await ctx.controller.auth.logout(ctx.refreshToken);
      ctx.clearRefreshCookie();
      return { success: true as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
