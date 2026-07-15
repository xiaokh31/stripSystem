import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class ContainerSuggestionQueryDto {
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MaxLength(64)
  query!: string;

  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    if (input === undefined) return 10;
    if (typeof input === 'string' || typeof input === 'number') {
      return Number(input);
    }
    return input;
  })
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}
