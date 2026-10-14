import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { AudioStorageModule } from '../../audio/audio-storage.module';
import { ReportModule } from '../report/report.module';
import { ReportDispatchAdapter } from './infrastructure/report-dispatch';
import { EVALUATION_USE_CASE, CONVERSATION_USE_CASE } from './application/evaluation.ports';
import { EvaluationApplicationService } from './application/evaluation.service';
import { ConversationApplicationService } from './application/conversation.service';
import { EvaluationController } from './evaluation.controller';
import { EvaluationConfig } from './infrastructure/evaluation-config';
import { AuthActiveAccounts } from './infrastructure/active-accounts';
import { PrismaEvaluationRepository } from './infrastructure/prisma-evaluation.repository';
import { MinioAudioStorage } from './infrastructure/minio-audio-storage';
import { FfprobeAudioInspector } from './infrastructure/audio-inspector';
import { OpenAIConversationGateway } from './infrastructure/openai-conversation.gateway';
import { BullMQConversationQueue } from './infrastructure/bullmq-conversation.queue';
import { ConversationProcessor } from './infrastructure/conversation.processor';

@Module({
  imports: [AuthModule, DatabaseModule, AudioStorageModule, ReportModule],
  providers: [
    EvaluationController, EvaluationConfig, AuthActiveAccounts, PrismaEvaluationRepository,
    FfprobeAudioInspector, OpenAIConversationGateway, BullMQConversationQueue, ConversationProcessor, ReportDispatchAdapter,
    {
      provide: EVALUATION_USE_CASE,
      useFactory: (accounts: AuthActiveAccounts, repository: PrismaEvaluationRepository, storage: MinioAudioStorage, jobs: BullMQConversationQueue, settings: EvaluationConfig, inspector: FfprobeAudioInspector, reports: ReportDispatchAdapter) =>
        new EvaluationApplicationService(accounts, repository, storage, jobs, settings, inspector, randomUUID, () => new Date(), reports),
      inject: [AuthActiveAccounts, PrismaEvaluationRepository, MinioAudioStorage, BullMQConversationQueue, EvaluationConfig, FfprobeAudioInspector, ReportDispatchAdapter],
    },
    {
      provide: CONVERSATION_USE_CASE,
      useFactory: (accounts: AuthActiveAccounts, repository: PrismaEvaluationRepository, ai: OpenAIConversationGateway, storage: MinioAudioStorage, inspector: FfprobeAudioInspector, settings: EvaluationConfig, jobs: BullMQConversationQueue, reports: ReportDispatchAdapter) =>
        new ConversationApplicationService(accounts, repository, ai, storage, inspector, settings, randomUUID, () => new Date(), jobs, reports),
      inject: [AuthActiveAccounts, PrismaEvaluationRepository, OpenAIConversationGateway, MinioAudioStorage, FfprobeAudioInspector, EvaluationConfig, BullMQConversationQueue, ReportDispatchAdapter],
    },
  ],
  exports: [EvaluationController],
})
export class EvaluationModule {}
