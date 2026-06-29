import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthUserResponseDto, LoginResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  me(
    @Headers('authorization') authorization?: string,
  ): Promise<AuthUserResponseDto> {
    return this.authService.getCurrentUser(authorization);
  }
}
