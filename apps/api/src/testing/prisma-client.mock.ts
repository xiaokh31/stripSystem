export class PrismaClient {
  async $connect(): Promise<void> {}

  async $disconnect(): Promise<void> {}

  $queryRaw(): Promise<unknown[]> {
    return Promise.resolve([{ connected: 1 }]);
  }
}
