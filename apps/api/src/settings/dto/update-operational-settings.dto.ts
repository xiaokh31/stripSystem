import { IsObject } from 'class-validator';

export class UpdateOperationalSettingsDto {
  @IsObject()
  values!: Record<string, string>;
}
