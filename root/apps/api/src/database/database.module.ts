import { Global, Module, Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, PrismaPg } from '@root/database';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}
  async onModuleDestroy() { await this.prisma.$disconnect(); }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL is required');
        return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      },
    },
    DatabaseLifecycle,
  ],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
