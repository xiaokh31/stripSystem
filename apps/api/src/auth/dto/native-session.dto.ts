import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LoginDto } from './login.dto';

export class NativeLoginDto extends LoginDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class NativeRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
