import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListContainerSuggestionsQueryDto {
  @IsString()
  destinationRegion!: string;

  @IsOptional()
  @IsString()
  containerNo?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
