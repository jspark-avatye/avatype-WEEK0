import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CONVERSATION_USE_CASE, type ConversationUseCase } from '../application/evaluation.ports';
import { BullMQConversationQueue } from './bullmq-conversation.queue';

@Injectable()
export class ConversationProcessor implements OnModuleInit {
  constructor(@Inject(CONVERSATION_USE_CASE) private readonly useCase: ConversationUseCase, private readonly queue: BullMQConversationQueue) {}
  onModuleInit() {
    this.queue.startWorker((input, progress) => this.useCase.process(input, progress));
  }
}
