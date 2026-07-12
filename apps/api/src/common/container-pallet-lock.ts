import { Prisma } from '../generated/prisma/client';

type RowLockClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export async function lockContainerRow(
  client: RowLockClient,
  containerId: string,
): Promise<void> {
  await client.$queryRaw`SELECT "id" FROM "containers" WHERE "id" = ${containerId} FOR UPDATE`;
}

export async function lockContainerDestinationRows(
  client: RowLockClient,
  destinationIds: string[],
): Promise<void> {
  for (const destinationId of [...destinationIds].sort()) {
    await client.$queryRaw`SELECT "id" FROM "container_destinations" WHERE "id" = ${destinationId} FOR UPDATE`;
  }
}

export async function lockPalletRows(
  client: RowLockClient,
  palletIds: string[],
): Promise<void> {
  for (const palletId of [...palletIds].sort()) {
    await client.$queryRaw`SELECT "id" FROM "pallets" WHERE "id" = ${palletId} FOR UPDATE`;
  }
}
