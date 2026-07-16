import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { LoginDto } from './login.dto';

export class NativeLoginDto extends LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}

export class NativeRefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  refreshToken!: string;
}
