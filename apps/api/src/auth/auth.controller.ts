import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthenticatedUser } from './auth-user';
import type {
  AuthUserResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthUserResponseDto {
    return user;
  }
}
