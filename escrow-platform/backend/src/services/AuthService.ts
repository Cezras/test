import prisma from '../config/database';
import logger from '../utils/logger';
import { ApiResponse } from '../types';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 12;

class AuthService {
  async register(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role?: 'BUYER' | 'SELLER';
  }): Promise<ApiResponse<{ user: any; token: string }>> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'Email already registered',
      };
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const emailToken = crypto.randomBytes(32).toString('hex');
    const emailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role || 'BUYER',
        emailToken,
        emailExpires,
        wallet: {
          create: {
            balance: 0n,
            currency: 'IDR',
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isVerified: true,
        wallet: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    });

    const token = this.generateToken(user.id, user.email, user.role);

    logger.info(`User registered: ${user.email}`);

    await this.logAudit(user.id, 'USER_REGISTER', 'User', user.id);

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified,
          wallet: user.wallet,
        },
        token,
      },
      message: 'Registration successful. Please verify your email.',
    };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<ApiResponse<{ user: any; token: string }>> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        wallet: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);

    if (!validPassword) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    if (user.isSuspended) {
      return {
        success: false,
        error: 'Account has been suspended',
      };
    }

    const token = this.generateToken(user.id, user.email, user.role);

    await this.logAudit(user.id, 'USER_LOGIN', 'User', user.id);

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified,
          wallet: user.wallet,
        },
        token,
      },
    };
  }

  async verifyEmail(token: string): Promise<ApiResponse> {
    const user = await prisma.user.findFirst({
      where: {
        emailToken: token,
        emailExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid or expired verification token',
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailToken: null,
        emailExpires: null,
      },
    });

    await this.logAudit(user.id, 'USER_LOGIN', 'User', user.id);

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  async resendVerification(email: string): Promise<ApiResponse> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    if (user.isVerified) {
      return {
        success: false,
        error: 'Email already verified',
      };
    }

    const emailToken = crypto.randomBytes(32).toString('hex');
    const emailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailToken, emailExpires },
    });

    return {
      success: true,
      message: 'Verification email sent',
    };
  }

  async forgotPassword(email: string): Promise<ApiResponse> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return {
        success: true,
        message: 'If the email exists, a reset link will be sent',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailToken: resetToken,
        emailExpires: resetExpires,
      },
    });

    return {
      success: true,
      message: 'If the email exists, a reset link will be sent',
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<ApiResponse> {
    const user = await prisma.user.findFirst({
      where: {
        emailToken: token,
        emailExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid or expired reset token',
      };
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailToken: null,
        emailExpires: null,
      },
    });

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  async getProfile(userId: string): Promise<ApiResponse<any>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: {
          select: {
            id: true,
            balance: true,
            lockedBalance: true,
            currency: true,
          },
        },
        bankAccounts: {
          where: { deletedAt: null },
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            accountName: true,
            isPrimary: true,
            isVerified: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        isSuspended: user.isSuspended,
        createdAt: user.createdAt,
        wallet: user.wallet,
        bankAccounts: user.bankAccounts,
      },
    };
  }

  async updateProfile(
    userId: string,
    input: { fullName?: string; phone?: string }
  ): Promise<ApiResponse> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
      },
    });

    return {
      success: true,
      data: user,
      message: 'Profile updated successfully',
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!validPassword) {
      return {
        success: false,
        error: 'Current password is incorrect',
      };
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  private generateToken(userId: string, email: string, role: string): string {
    return jwt.sign(
      { userId, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  private async logAudit(
    userId: string,
    action: any,
    entityType: string,
    entityId: string
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
      },
    });
  }
}

export default AuthService;
