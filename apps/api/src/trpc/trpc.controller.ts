import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import { appRouter, type RpcContext } from '@root/trpc-contract';
import { AppController } from '../app.controller';
import { AuthController } from '../module/auth/auth.controller';
import { AuthConfig } from '../module/auth/infrastructure/auth-config';
import { EvaluationController } from '../module/evaluation/evaluation.controller';
import { ReportController } from '../module/report/report.controller';
import { preserveMultipartBody } from './multipart-request';

const refreshCookie = 'refresh_token';

function readRefreshCookie(header: string | undefined): string | undefined {
  const cookie = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${refreshCookie}=`));
  return cookie?.slice(refreshCookie.length + 1);
}

@Controller('trpc')
export class TrpcController {
  constructor(
    private readonly appController: AppController,
    private readonly authController: AuthController,
    private readonly authConfig: AuthConfig,
    private readonly evaluationController: EvaluationController,
    private readonly reportController: ReportController,
  ) {}
  @All(':path')
  handle(@Req() req: Request, @Res() res: Response) {
    preserveMultipartBody(req);
    const path = req.params.path;
    return nodeHTTPRequestHandler({
      req,
      res,
      path: Array.isArray(path) ? path.join('/') : path,
      router: appRouter,
      maxBodySize: 10 * 1024 * 1024 + 64 * 1024,
      // This is an ordinary controller method call; Nest HTTP guards/pipes/interceptors do not run here.
      createContext: (): RpcContext => ({
        controller: { health: () => this.appController.health(), auth: this.authController, evaluation: this.evaluationController, report: this.reportController },
        origin: req.get('origin'),
        webOrigin: this.authConfig.webOrigin,
        authorization: req.get('authorization'),
        refreshToken: readRefreshCookie(req.get('cookie')),
        setRefreshCookie: (token: string, expiresAt: Date) => {
          res.cookie(refreshCookie, token, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/trpc',
            maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
          });
        },
        clearRefreshCookie: () => {
          res.clearCookie(refreshCookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/trpc' });
        },
      }),
    });
  }
}
