import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  adminAuthHeader,
  configureAuthTestEnv,
  inactiveAuthHeader,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
} from './auth-test-helpers';

interface ErrorBody {
  code: string;
}

describe('RBAC route guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    configureAuthTestEnv();
    prisma = {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
    };
    installAuthMock(prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('keeps health and login public while rejecting protected business routes without a token', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'bad-password' })
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
      });

    await request(app.getHttpServer())
      .get('/api/imports')
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('UNAUTHENTICATED');
      });
  });

  it('rejects invalid tokens and inactive users before business handlers run', async () => {
    await request(app.getHttpServer())
      .get('/api/imports')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('UNAUTHENTICATED');
      });

    await request(app.getHttpServer())
      .get('/api/imports')
      .set('Authorization', inactiveAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('USER_INACTIVE');
      });
  });

  it('allows OFFICE import access but blocks WAREHOUSE import upload', async () => {
    await request(app.getHttpServer())
      .post('/api/imports')
      .set('Authorization', officeAuthHeader())
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('IMPORT_FILE_REQUIRED');
      });

    await request(app.getHttpServer())
      .post('/api/imports')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('allows WAREHOUSE scan routes but blocks label generation', async () => {
    await request(app.getHttpServer())
      .post('/api/load-jobs/load-job-1/scan')
      .set('Authorization', warehouseAuthHeader())
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/containers/container-1/generate-labels')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('allows ADMIN through protected route permission checks', async () => {
    await request(app.getHttpServer())
      .post('/api/imports')
      .set('Authorization', adminAuthHeader())
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('IMPORT_FILE_REQUIRED');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
