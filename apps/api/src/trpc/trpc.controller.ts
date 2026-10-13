import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import { appRouter } from '@root/trpc-contract';
import { AppController } from '../app.controller';

@Controller('trpc')
export class TrpcController {
  constructor(private readonly appController: AppController) {}
  @All(':path')
  handle(@Req() req: Request, @Res() res: Response) {
    const path = req.params.path;
    return nodeHTTPRequestHandler({
      req,
      res,
      path: Array.isArray(path) ? path.join('/') : path,
      router: appRouter,
      // This is an ordinary controller method call; Nest HTTP guards/pipes/interceptors do not run here.
      createContext: () => ({ controller: this.appController }),
    });
  }
}
