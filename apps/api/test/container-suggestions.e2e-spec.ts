import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PERMISSIONS, ROLE_CODES } from './../src/auth/permissions';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  AuthTestUser,
  authHeaderFor,
  configureAuthTestEnv,
  installAuthMock,
} from './auth-test-helpers';

describe('Shared container suggestions API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: { $queryRaw: jest.Mock };
  const containersReader = permissionUser(
    'containers-reader',
    PERMISSIONS.containers.read,
  );
  const inventoryReader = permissionUser(
    'inventory-reader',
    PERMISSIONS.inventory.read,
  );

  beforeEach(async () => {
    configureAuthTestEnv();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { containerId: 'container-1', containerNo: 'CSNU8877228' },
      ]),
    };
    installAuthMock(prisma, [containersReader, inventoryReader]);

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

  afterEach(async () => {
    await app.close();
  });

  it('keeps containers.read and inventory.read contracts independent and returns only stable raw identity fields', async () => {
    const containersResponse = await request(app.getHttpServer())
      .get('/api/containers/suggestions?query=csnu&limit=10')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(200);
    expect(containersResponse.body).toEqual({
      items: [{ containerId: 'container-1', containerNo: 'CSNU8877228' }],
    });

    await request(app.getHttpServer())
      .get('/api/inventory/container-suggestions?query=csnu')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(403);

    const inventoryResponse = await request(app.getHttpServer())
      .get('/api/inventory/container-suggestions?query=CSNU')
      .set('Authorization', authHeaderFor(inventoryReader))
      .expect(200);
    expect(inventoryResponse.body.items[0]).toEqual({
      containerId: 'container-1',
      containerNo: 'CSNU8877228',
    });
    expect(Object.keys(inventoryResponse.body.items[0]).sort()).toEqual([
      'containerId',
      'containerNo',
    ]);

    await request(app.getHttpServer())
      .get('/api/containers/suggestions?query=csnu')
      .set('Authorization', authHeaderFor(inventoryReader))
      .expect(403);
  });

  it('validates query length and limit boundaries and treats whitespace as empty', async () => {
    await request(app.getHttpServer())
      .get('/api/containers/suggestions?query=%20%20%20')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(200, { items: [] });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get('/api/containers/suggestions?query=A&limit=0')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/containers/suggestions?query=A&limit=21')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/containers/suggestions?query=${'A'.repeat(65)}`)
      .set('Authorization', authHeaderFor(containersReader))
      .expect(400);
  });
});

function permissionUser(id: string, permission: string): AuthTestUser {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    role: ROLE_CODES.office,
    isActive: true,
    roleAssignments: [
      {
        role: {
          code: `${id.toUpperCase()}_ROLE`,
          isActive: true,
          permissions: [{ permission: { code: permission } }],
        },
      },
    ],
  };
}
