import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TrpcController } from './trpc/trpc.controller';
import { AuthModule } from './module/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AppController, TrpcController],
  providers: [AppController],
})
export class AppModule {}
