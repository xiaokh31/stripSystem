import type { Prisma } from '../generated/prisma/client';
import type { UnloadingWageSettlementReview } from './dto/list-unloading-wage-settlements-query.dto';

export function unloadingWageSettlementWhere(
  review?: UnloadingWageSettlementReview,
): Prisma.UnloadingWageSettlementWhereInput {
  return review === 'NEEDS_REVIEW'
    ? { OR: [{ warningCount: { gt: 0 } }, { errorCount: { gt: 0 } }] }
    : {};
}
