import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: async () => [{ '?column?': 1 }],
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok for process health', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('fieldops-api');
  });

  it('returns ok when the database responds', async () => {
    const result = await controller.checkDatabase();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
  });
});
