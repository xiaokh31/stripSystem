import { IsString } from 'class-validator';

export class ListPalletsQueryDto {
  @IsString()
  containerId!: string;
}
