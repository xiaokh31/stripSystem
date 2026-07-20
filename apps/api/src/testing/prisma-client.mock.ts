export class PrismaClient {
  async $connect(): Promise<void> {}

  async $disconnect(): Promise<void> {}

  $queryRaw(): Promise<unknown[]> {
    return Promise.resolve([{ connected: 1 }]);
  }
}

export const Prisma = {
  JsonNull: null,
  DbNull: null,
} as const;
