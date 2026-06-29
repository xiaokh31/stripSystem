import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContainerStatus } from '../../generated/prisma/enums';

const containerStatuses = Object.values(ContainerStatus);

export class UpdateContainerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  containerNo?: string;

  @IsOptional()
  @IsString()
  dockNo?: string | null;

  @IsOptional()
  @IsString()
  company?: string | null;

  @IsOptional()
  @IsIn(containerStatuses)
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  correctionNote?: string | null;

  @IsOptional()
  @IsString()
  correctedById?: string | null;
}
