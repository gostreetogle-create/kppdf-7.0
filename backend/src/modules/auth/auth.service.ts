import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../users/schemas/user.schema';
import { Role } from '../roles/schemas/role.schema';
import { ALL_PERMISSION_KEYS } from '../../common/types/permission-keys';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {}

  /**
   * Validate credentials and return JWT tokens.
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userModel.findOne({ username }).exec();
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    const role = await this.roleModel.findById(user.roleId).exec();
    if (!role || role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is not active');
    }

    const permissions =
      role.name === 'admin'
        ? ALL_PERMISSION_KEYS
        : (role.permissions as typeof ALL_PERMISSION_KEYS);

    const payload = {
      sub: user._id.toString(),
      username: user.username,
      roleName: role.name,
      roleId: role._id.toString(),
      permissions,
    };

    const jwtSecret = this.config.get<string>('app.jwt.secret')!;
    const refreshSecret = this.config.get<string>('app.jwt.refreshSecret')!;
    const expiresIn = this.config.get<string>('app.jwt.expiresIn') ?? '15m';
    const refreshExpiresIn =
      this.config.get<string>('app.jwt.refreshExpiresIn') ?? '7d';

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: expiresIn as any,
    });
    const refreshToken = this.jwtService.sign(
      { sub: user._id.toString() },
      { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshToken(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const refreshSecret = this.config.get<string>('app.jwt.refreshSecret')!;
      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: refreshSecret,
      });

      const user = await this.userModel.findById(payload.sub).exec();
      if (!user || user.deletedAt) {
        throw new UnauthorizedException('User not found or deleted');
      }

      const role = await this.roleModel.findById(user.roleId).exec();
      if (!role || role.status !== 'ACTIVE') {
        throw new UnauthorizedException('User role is not active');
      }

      const permissions =
        role.name === 'admin'
          ? ALL_PERMISSION_KEYS
          : (role.permissions as typeof ALL_PERMISSION_KEYS);

      const newPayload = {
        sub: user._id.toString(),
        username: user.username,
        roleName: role.name,
        roleId: role._id.toString(),
        permissions,
      };

      const jwtSecret = this.config.get<string>('app.jwt.secret')!;
      const expiresIn = this.config.get<string>('app.jwt.expiresIn') ?? '15m';
      const refreshExpiresIn =
        this.config.get<string>('app.jwt.refreshExpiresIn') ?? '7d';

      const accessToken = this.jwtService.sign(newPayload, {
        secret: jwtSecret,
        expiresIn: expiresIn as any,
      });
      const newRefreshToken = this.jwtService.sign(
        { sub: user._id.toString() },
        { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
      );

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
