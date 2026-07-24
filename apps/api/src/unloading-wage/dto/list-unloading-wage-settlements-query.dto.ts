import { IsIn, IsOptional } from 'class-validator';

export const UNLOADING_WAGE_SETTLEMENT_REVIEWS = ['NEEDS_REVIEW'] as const;
export type UnloadingWageSettlementReview =
  (typeof UNLOADING_WAGE_SETTLEMENT_REVIEWS)[number];

export class ListUnloadingWageSettlementsQueryDto {
  @IsOptional()
  @IsIn(UNLOADING_WAGE_SETTLEMENT_REVIEWS)
  review?: UnloadingWageSettlementReview;
}
