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
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
} from './auth-test-helpers';
import { createRbacManagementPrismaMock } from './rbac-management-test-fixture';

interface LoginBody {
  user: {
    permissions: string[];
  };
}

interface ErrorBody {
  code: string;
}

describe('Roles and permissions API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    configureAuthTestEnv();
    const fixture = await createRbacManagementPrismaMock();
    installAuthMock(fixture.prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fixture.prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('allows ADMIN to query permissions and create/update roles', async () => {
    await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', adminAuthHeader())
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((item: { code: string }) => item.code),
        ).toContain('roles.manage');
      });

    const created = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', adminAuthHeader())
      .send({
        code: 'SUPERVISOR',
        displayName: 'Supervisor',
        description: 'Floor supervisor',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      role: {
        code: 'SUPERVISOR',
        displayName: 'Supervisor',
        permissions: [],
      },
      audit: {
        actorUserId: 'auth-admin',
        action: 'roles.create',
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/roles/${created.body.role.id}`)
      .set('Authorization', adminAuthHeader())
      .send({ displayName: 'Warehouse Supervisor', isActive: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.role.displayName).toBe('Warehouse Supervisor');
      });

    await request(app.getHttpServer())
      .patch(`/api/roles/${created.body.role.id}/permissions`)
      .set('Authorization', adminAuthHeader())
      .send({ permissionCodes: ['load_jobs.read'] })
      .expect(200)
      .expect((response) => {
        expect(
          response.body.role.permissions.map(
            (item: { code: string }) => item.code,
          ),
        ).toEqual(['load_jobs.read']);
      });
  });

  it('rejects OFFICE and WAREHOUSE users from roles and permissions APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', officeAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });

    await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', warehouseAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('reflects updated role permissions after the user logs in again', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'planner@example.com',
        password: 'Start12345',
        roleCodes: ['OFFICE'],
      })
      .expect(201);

    const before = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'planner@example.com', password: 'Start12345' })
      .expect(201);
    expect((before.body as LoginBody).user.permissions).toEqual([
      'imports.read',
    ]);

    await request(app.getHttpServer())
      .patch('/api/roles/role-office/permissions')
      .set('Authorization', adminAuthHeader())
      .send({ permissionCodes: ['imports.read', 'reports.generate'] })
      .expect(200);

    const after = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'planner@example.com', password: 'Start12345' })
      .expect(201);
    expect((after.body as LoginBody).user.permissions).toEqual([
      'imports.read',
      'reports.generate',
    ]);
  });

  afterEach(async () => {
    await app.close();
  });
});
