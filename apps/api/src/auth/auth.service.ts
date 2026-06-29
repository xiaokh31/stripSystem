import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthUserResponseDto, LoginResponseDto } from './dto/auth-response.dto';
import { AuthTokenService } from './auth-token.service';
import { PasswordService } from './password.service';
import { PrismaService } from '../prisma/prisma.service';

const AUTH_USER_INCLUDE = {
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw this.invalidCredentials();
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'This user is inactive.',
        details: {},
      });
    }

    const profile = this.toUserProfile(user);
    if (this.isSystemUser(user, profile.roles)) {
      throw new ForbiddenException({
        code: 'SYSTEM_USER_LOGIN_NOT_ALLOWED',
        message: 'SYSTEM users cannot use ordinary password login.',
        details: {},
      });
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.tokenService.sign({
      sub: user.id,
      email: user.email,
      roles: profile.roles,
    });

    return {
      accessToken: token.accessToken,
      tokenType: 'Bearer',
      expiresIn: token.expiresIn,
      user: profile,
    };
  }

  async getCurrentUser(
    authorization: string | undefined,
  ): Promise<AuthUserResponseDto> {
    const payload = this.tokenService.verifyBearerHeader(authorization);
    const user = await this.findUserById(payload.sub);
    if (!user) {
      throw this.unauthenticated('Authenticated user no longer exists.');
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'This user is inactive.',
        details: {},
      });
    }

    return this.toUserProfile(user);
  }

  private findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: AUTH_USER_INCLUDE,
    }) as Promise<AuthUserRecord | null>;
  }

  private findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: AUTH_USER_INCLUDE,
    }) as Promise<AuthUserRecord | null>;
  }

  private toUserProfile(user: AuthUserRecord): AuthUserResponseDto {
    const activeAssignments = user.roleAssignments.filter(
      (assignment) => assignment.role.isActive,
    );
    const roles =
      activeAssignments.length > 0
        ? activeAssignments.map((assignment) => assignment.role.code)
        : [user.role];
    const permissions = activeAssignments.flatMap((assignment) =>
      assignment.role.permissions.map((item) => item.permission.code),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...new Set(roles)].sort(),
      permissions: [...new Set(permissions)].sort(),
    };
  }

  private isSystemUser(user: AuthUserRecord, roles: string[]): boolean {
    return user.role === 'SYSTEM' || roles.includes('SYSTEM');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      details: {},
    });
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message,
      details: {},
    });
  }
}

interface AuthUserRecord {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  role: string;
  isActive: boolean;
  roleAssignments: RoleAssignmentRecord[];
}

interface RoleAssignmentRecord {
  role: {
    code: string;
    isActive: boolean;
    permissions: Array<{
      permission: {
        code: string;
      };
    }>;
  };
}
