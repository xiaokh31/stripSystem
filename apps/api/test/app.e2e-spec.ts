import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as { timestamp?: unknown };

        expect(response.body).toMatchObject({
          status: 'ok',
          version: '0.0.1',
          database: { status: 'up' },
          queue: {
            status: 'disabled',
            error: { code: 'QUEUE_DISABLED' },
          },
        });
        expect(body.timestamp).toEqual(expect.any(String));
      });
  });

  it('uses the global /api prefix', () => {
    return request(app.getHttpServer()).get('/health').expect(404);
  });

  it('allows local web origin CORS preflight requests', () => {
    return request(app.getHttpServer())
      .options('/api/imports')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBe(
          'http://127.0.0.1:3000',
        );
        expect(response.headers['access-control-allow-methods']).toContain(
          'POST',
        );
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
