import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TrpcController } from './trpc/trpc.controller';

@Module({ controllers: [AppController, TrpcController] })
export class AppModule {}
