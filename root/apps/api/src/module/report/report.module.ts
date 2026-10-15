import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { AudioStorageModule } from '../../audio/audio-storage.module';
import { MinioAudioStorage } from '../../audio/minio-audio-storage';
import { REPORT_USE_CASE, REPORT_ANALYSIS_USE_CASE } from './application/report.ports';
import { ReportApplicationService } from './application/report.service';
import { ReportController } from './report.controller';
import { ReportConfig } from './infrastructure/report-config';
import { AuthReportAccounts } from './infrastructure/report-accounts';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository';
import { WavPreparation } from './infrastructure/wav-preparation';
import { OpenAIReportGateway } from './infrastructure/openai-report.gateway';
import { BullMQReportQueue } from './infrastructure/bullmq-report.queue';
import { ReportProcessor } from './infrastructure/report.processor';
@Module({
  imports: [AuthModule, DatabaseModule, AudioStorageModule],
  providers: [ReportController, ReportConfig, AuthReportAccounts, PrismaReportRepository, WavPreparation, OpenAIReportGateway, BullMQReportQueue, ReportProcessor,
    { provide: REPORT_USE_CASE, useFactory: (accounts: AuthReportAccounts, repository: PrismaReportRepository, jobs: BullMQReportQueue, audio: MinioAudioStorage, preparation: WavPreparation, ai: OpenAIReportGateway) => new ReportApplicationService(accounts, repository, jobs, audio, preparation, ai, () => new Date()),
      inject: [AuthReportAccounts, PrismaReportRepository, BullMQReportQueue, MinioAudioStorage, WavPreparation, OpenAIReportGateway] },
    { provide: REPORT_ANALYSIS_USE_CASE, useExisting: REPORT_USE_CASE },
  ],
  exports: [ReportController, REPORT_USE_CASE],
})
export class ReportModule {}
