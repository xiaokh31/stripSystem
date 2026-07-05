import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  adminAuthHeader,
  authTestUsers,
  configureAuthTestEnv,
  inactiveAuthHeader,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
} from './auth-test-helpers';
import { createRbacManagementPrismaMock } from './rbac-management-test-fixture';

interface ErrorBody {
  code: string;
}

describe('RBAC route guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    configureAuthTestEnv();
    const fixture = await createRbacManagementPrismaMock();
    prisma = fixture.prisma;
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

    await request(app.getHttpServer())
      .get('/api/attendance-imports')
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

  it('allows OFFICE attendance upload permission but blocks WAREHOUSE attendance upload', async () => {
    await request(app.getHttpServer())
      .post('/api/attendance-imports')
      .set('Authorization', officeAuthHeader())
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe(
          'ATTENDANCE_FILE_REQUIRED',
        );
      });

    await request(app.getHttpServer())
      .post('/api/attendance-imports')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('blocks WAREHOUSE from attendance read routes', async () => {
    await request(app.getHttpServer())
      .get('/api/attendance-imports')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('blocks WAREHOUSE from attendance wage record generation', async () => {
    await request(app.getHttpServer())
      .post('/api/attendance-imports/attendance-import-1/generate-wage-record')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('returns the current user profile for a valid token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', officeAuthHeader())
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 'auth-office',
          email: 'office@example.com',
          roles: ['OFFICE'],
        });
        expect(response.body.permissions).toEqual(
          authTestUsers.office.roleAssignments[0].role.permissions
            .map((item) => item.permission.code)
            .sort(),
        );
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      });
  });

  it('allows WAREHOUSE scan routes but blocks label generation', async () => {
    await request(app.getHttpServer())
      .post('/api/load-jobs/load-job-1/scan')
      .set('Authorization', warehouseAuthHeader())
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/load-jobs/load-job-1/close')
      .set('Authorization', warehouseAuthHeader())
      .send({ operatorId: 123 })
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

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', adminAuthHeader())
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', adminAuthHeader())
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((role: { code: string }) => role.code),
        ).toEqual(['ADMIN', 'OFFICE', 'SYSTEM', 'WAREHOUSE']);
      });

    await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', adminAuthHeader())
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((item: { code: string }) => item.code),
        ).toContain('users.manage');
      });
  });

  it('blocks OFFICE and WAREHOUSE from account-management APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', officeAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });

    await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
