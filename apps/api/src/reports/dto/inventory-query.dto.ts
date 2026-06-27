import { IsIn, IsOptional, IsString } from 'class-validator';
import { PalletStatus } from '../../generated/prisma/enums';

const PALLET_STATUSES = Object.values(PalletStatus);

export class InventoryQueryDto {
  @IsOptional()
  @IsString()
  containerNo?: string;

  @IsOptional()
  @IsString()
  destinationCode?: string;

  @IsOptional()
  @IsIn(PALLET_STATUSES)
  status?: string;
}
