import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TrpcController } from './trpc/trpc.controller';
import { AuthModule } from './module/auth/auth.module';
import { EvaluationModule } from './module/evaluation/evaluation.module';
import { ReportModule } from './module/report/report.module';

@Module({
  imports: [AuthModule, EvaluationModule, ReportModule],
  controllers: [AppController, TrpcController],
  providers: [AppController],
})
export class AppModule {}
