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

interface ErrorBody {
  code: string;
}

describe('Users management API (e2e)', () => {
  let app: INestApplication<App>;
  let persistedUsers: Array<{ email: string | null; role: string }>;

  beforeEach(async () => {
    configureAuthTestEnv();
    const fixture = await createRbacManagementPrismaMock();
    persistedUsers = fixture.users;
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

  it('allows ADMIN to create OFFICE and WAREHOUSE users without returning password hashes', async () => {
    const office = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'Planner@Example.com',
        name: 'Planner',
        password: 'Start12345',
        roleCodes: ['OFFICE'],
      })
      .expect(201);

    expect(office.body).toMatchObject({
      user: {
        email: 'planner@example.com',
        name: 'Planner',
        isActive: true,
        roles: [expect.objectContaining({ code: 'OFFICE' })],
      },
      audit: {
        actorUserId: 'auth-admin',
        action: 'users.create',
      },
    });
    expect(JSON.stringify(office.body)).not.toContain('passwordHash');
    expect(JSON.stringify(office.body)).not.toContain('Start12345');

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'warehouse-user@example.com',
        password: 'Start12345',
        roleCodes: ['WAREHOUSE'],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.user.roles[0].code).toBe('WAREHOUSE');
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      });

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', adminAuthHeader())
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toHaveLength(2);
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      });
  });

  it('accepts six-character lowercase passwords and rejects passwords shorter than six characters', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'simple-password@example.com',
        password: 'simple',
        roleCodes: ['OFFICE'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'simple-password@example.com', password: 'simple' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/users/${created.body.user.id}/reset-password`)
      .set('Authorization', adminAuthHeader())
      .send({ password: 'lowercase' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'simple-password@example.com', password: 'lowercase' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'short-password@example.com',
        password: 'short',
        roleCodes: ['OFFICE'],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/users/${created.body.user.id}/reset-password`)
      .set('Authorization', adminAuthHeader())
      .send({ password: 'short' })
      .expect(400);
  });

  it('stores wage manager assignments in user_roles while keeping the legacy role enum compatible', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'hr-manager-created@example.com',
        password: 'Start12345',
        roleCodes: ['HR_MANAGER'],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.user.roles[0].code).toBe('HR_MANAGER');
      });

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email: 'warehouse-manager-created@example.com',
        password: 'Start12345',
        roleCodes: ['WAREHOUSE_MANAGER'],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.user.roles[0].code).toBe('WAREHOUSE_MANAGER');
      });

    expect(
      persistedUsers.find(
        (user) => user.email === 'hr-manager-created@example.com',
      )?.role,
    ).toBe('OFFICE');
    expect(
      persistedUsers.find(
        (user) => user.email === 'warehouse-manager-created@example.com',
      )?.role,
    ).toBe('WAREHOUSE');
  });

  it('rejects OFFICE and WAREHOUSE users from users management APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', officeAuthHeader())
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', warehouseAuthHeader())
      .send({
        email: 'blocked@example.com',
        password: 'Start12345',
        roleCodes: ['WAREHOUSE'],
      })
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('blocks disabled users from login and protected API access', async () => {
    const created = await createOfficeUser(
      'disabled@example.com',
      'Start12345',
    );
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/api/auth/login')
      .send({ email: 'disabled@example.com', password: 'Start12345' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/users/${created.body.user.id}/status`)
      .set('Authorization', adminAuthHeader())
      .send({ isActive: false })
      .expect(200)
      .expect((response) => {
        expect(response.body.user.isActive).toBe(false);
      });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'disabled@example.com', password: 'Start12345' })
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
      });

    await browser
      .get('/api/imports')
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe(
          'AUTH_SESSION_REVOKED',
        );
      });
  });

  it('resets passwords so the old password fails and the new password logs in', async () => {
    const created = await createOfficeUser('reset@example.com', 'OldPass123');

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'OldPass123' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/users/${created.body.user.id}/reset-password`)
      .set('Authorization', adminAuthHeader())
      .send({ password: 'NewPass123' })
      .expect(201)
      .expect((response) => {
        expect(response.body.audit.action).toBe('users.reset_password');
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'OldPass123' })
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
      });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'NewPass123' })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  function createOfficeUser(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', adminAuthHeader())
      .send({
        email,
        password,
        roleCodes: ['OFFICE'],
      })
      .expect(201);
  }
});
