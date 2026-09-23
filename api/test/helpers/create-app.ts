import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../src/common/constants.js';
import { configureApp } from '../../src/configure-app.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app as INestApplication<App>;
}

export function api(app: INestApplication<App>) {
  return request.agent(app.getHttpServer());
}

export function withCsrf(req: request.Test) {
  return req.set(CSRF_HEADER, CSRF_HEADER_VALUE);
}

export async function loginAs(
  app: INestApplication<App>,
  email: string,
  password: string,
) {
  const agent = api(app);
  const response = await withCsrf(agent.post('/api/auth/login')).send({
    email,
    password,
  });
  return { agent, response };
}

export function prismaFrom(app: INestApplication<App>) {
  return app.get(PrismaService);
}
