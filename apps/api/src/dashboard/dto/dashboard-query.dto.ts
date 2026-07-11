import { IsIn, IsOptional, Matches } from 'class-validator';

export const DASHBOARD_RANGES = ['today', '7d', '30d'] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export class DashboardOperationsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_RANGES)
  range: DashboardRange = 'today';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
