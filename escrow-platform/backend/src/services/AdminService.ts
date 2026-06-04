import prisma from '../config/database';
import logger from '../utils/logger';
import { ApiResponse, TransactionStatus } from '../types';

class AdminService {
  async getDashboardStats(): Promise<ApiResponse<any>> {
    try {
      const [
        totalTransactions,
        totalUsers,
        totalVolume,
        pendingDisputes,
        pendingWithdrawals,
        platformRevenue,
      ] = await Promise.all([
        prisma.escrowTransaction.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.escrowTransaction.aggregate({
          _sum: { amount: true },
          where: { deletedAt: null },
        }),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
        prisma.withdrawal.count({ where: { status: 'PENDING' } }),
        prisma.wallet.findFirst({
          where: { user: { email: process.env.PLATFORM_WALLET_EMAIL || 'platform@escrow.com' } },
          select: { balance: true },
        }),
      ]);

      return {
        success: true,
        data: {
          totalTransactions,
          totalUsers,
          totalVolume: totalVolume._sum.amount?.toString() || '0',
          pendingDisputes,
          pendingWithdrawals,
          platformRevenue: platformRevenue?.balance.toString() || '0',
        },
      };
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      return {
        success: false,
        error: 'Failed to fetch dashboard stats',
      };
    }
  }

  async getAllTransactions(
    page: number = 1,
    limit: number = 20,
    status?: string
  ): Promise<ApiResponse<any>> {
    try {
      const where: any = { deletedAt: null };
      
      if (status) {
        where.status = status;
      }

      const [transactions, total] = await Promise.all([
        prisma.escrowTransaction.findMany({
          where,
          include: {
            participants: {
              include: { user: { select: { id: true, email: true, fullName: true } } },
            },
            payments: { take: 1, orderBy: { createdAt: 'desc' } },
            disputes: { where: { status: { not: 'CLOSED' } } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.escrowTransaction.count({ where }),
      ]);

      return {
        success: true,
        data: transactions.map((t) => ({
          id: t.id,
          title: t.title,
          amount: t.amount.toString(),
          platformFee: t.platformFee.toString(),
          totalAmount: t.totalAmount.toString(),
          status: t.status,
          createdAt: t.createdAt,
          buyer: t.participants.find((p) => p.role === 'BUYER')?.user,
          seller: t.participants.find((p) => p.role === 'SELLER')?.user,
          hasDispute: t.disputes.length > 0,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      logger.error('Error fetching all transactions:', error);
      return {
        success: false,
        error: 'Failed to fetch transactions',
      };
    }
  }

  async getTransactionById(transactionId: string): Promise<ApiResponse<any>> {
    try {
      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
        include: {
          participants: { include: { user: true } },
          payments: true,
          deliveryProofs: true,
          disputes: { include: { evidence: true } },
          messages: { include: { sender: { select: { id: true, email: true, fullName: true } } } },
        },
      });

      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      return {
        success: true,
        data: {
          ...transaction,
          amount: transaction.amount.toString(),
          platformFee: transaction.platformFee.toString(),
          totalAmount: transaction.totalAmount.toString(),
        },
      };
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      return { success: false, error: 'Failed to fetch transaction' };
    }
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    notes?: string,
    adminUserId: string
  ): Promise<ApiResponse<any>> {
    try {
      const updated = await prisma.escrowTransaction.update({
        where: { id: transactionId },
        data: {
          status,
          completedAt: ['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status)
            ? new Date()
            : undefined,
        },
        include: { participants: { include: { user: true } }, payments: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'ADMIN_OVERRIDE',
          entityType: 'EscrowTransaction',
          entityId: transactionId,
          details: { previousStatus: status, notes },
        },
      });

      return {
        success: true,
        data: { id: updated.id, status: updated.status },
        message: `Transaction status updated to ${status}`,
      };
    } catch (error) {
      logger.error('Error updating transaction status:', error);
      return { success: false, error: 'Failed to update transaction status' };
    }
  }

  async getDisputes(page: number = 1, limit: number = 20, status?: string): Promise<ApiResponse<any>> {
    try {
      const where: any = {};
      
      if (status) {
        where.status = status;
      }

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where,
          include: {
            transaction: {
              select: { id: true, title: true, amount: true, status: true },
            },
            evidence: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.dispute.count({ where }),
      ]);

      return {
        success: true,
        data: disputes.map((d) => ({
          ...d,
          settlementAmount: d.settlementAmount?.toString(),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      logger.error('Error fetching disputes:', error);
      return { success: false, error: 'Failed to fetch disputes' };
    }
  }

  async getDisputeById(disputeId: string): Promise<ApiResponse<any>> {
    try {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: {
          transaction: {
            include: {
              participants: { include: { user: true } },
              payments: true,
              deliveryProofs: true,
            },
          },
          evidence: true,
        },
      });

      if (!dispute) {
        return { success: false, error: 'Dispute not found' };
      }

      return {
        success: true,
        data: {
          ...dispute,
          settlementAmount: dispute.settlementAmount?.toString(),
        },
      };
    } catch (error) {
      logger.error('Error fetching dispute:', error);
      return { success: false, error: 'Failed to fetch dispute' };
    }
  }

  async resolveDispute(
    disputeId: string,
    resolution: string,
    settlementAmount?: number,
    notes?: string,
    adminUserId?: string
  ): Promise<ApiResponse<any>> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const dispute = await tx.dispute.update({
          where: { id: disputeId },
          data: {
            status: 'RESOLVED',
            resolution: resolution as any,
            settlementAmount: settlementAmount ? BigInt(settlementAmount) : undefined,
            notes,
            resolvedBy: adminUserId,
            resolvedAt: new Date(),
          },
          include: { transaction: { include: { participants: true } } },
        });

        let newTxStatus: TransactionStatus;
        
        if (resolution === 'RELEASE_TO_SELLER') {
          newTxStatus = 'COMPLETED';
        } else if (resolution === 'REFUND_BUYER') {
          newTxStatus = 'REFUNDED';
        } else {
          newTxStatus = 'COMPLETED';
        }

        await tx.escrowTransaction.update({
          where: { id: dispute.transactionId },
          data: { status: newTxStatus, completedAt: new Date() },
        });

        return dispute;
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId!,
          action: 'DISPUTE_RESOLVE',
          entityType: 'Dispute',
          entityId: disputeId,
          details: { resolution, settlementAmount, notes },
        },
      });

      return {
        success: true,
        data: result,
        message: 'Dispute resolved successfully',
      };
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      return { success: false, error: 'Failed to resolve dispute' };
    }
  }

  async getUsers(page: number = 1, limit: number = 20, role?: string): Promise<ApiResponse<any>> {
    try {
      const where: any = { deletedAt: null };
      
      if (role) {
        where.role = role;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            role: true,
            isVerified: true,
            isSuspended: true,
            createdAt: true,
            wallet: { select: { balance: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      return {
        success: true,
        data: users.map((u) => ({
          ...u,
          wallet: u.wallet?.balance.toString(),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      logger.error('Error fetching users:', error);
      return { success: false, error: 'Failed to fetch users' };
    }
  }

  async getUserById(userId: string): Promise<ApiResponse<any>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          bankAccounts: { where: { deletedAt: null } },
          withdrawals: { orderBy: { createdAt: 'desc' }, take: 10 },
          transactions: {
            include: { transaction: { select: { id: true, title: true, status: true } } },
            take: 10,
          },
        },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        data: {
          ...user,
          wallet: user.wallet?.balance.toString(),
        },
      };
    } catch (error) {
      logger.error('Error fetching user:', error);
      return { success: false, error: 'Failed to fetch user' };
    }
  }

  async suspendUser(userId: string, reason: string, adminUserId: string): Promise<ApiResponse<any>> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isSuspended: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'USER_SUSPEND',
          entityType: 'User',
          entityId: userId,
          details: { reason },
        },
      });

      return { success: true, message: 'User suspended successfully' };
    } catch (error) {
      logger.error('Error suspending user:', error);
      return { success: false, error: 'Failed to suspend user' };
    }
  }

  async unsuspendUser(userId: string, adminUserId: string): Promise<ApiResponse<any>> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isSuspended: false },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'USER_UNSUSPEND',
          entityType: 'User',
          entityId: userId,
        },
      });

      return { success: true, message: 'User unsuspended successfully' };
    } catch (error) {
      logger.error('Error unsuspending user:', error);
      return { success: false, error: 'Failed to unsuspend user' };
    }
  }

  async getWithdrawals(page: number = 1, limit: number = 20, status?: string): Promise<ApiResponse<any>> {
    try {
      const where: any = {};
      
      if (status) {
        where.status = status;
      }

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawal.findMany({
          where,
          include: {
            user: { select: { id: true, email: true, fullName: true } },
            bankAccount: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.withdrawal.count({ where }),
      ]);

      return {
        success: true,
        data: withdrawals.map((w) => ({
          ...w,
          amount: w.amount.toString(),
          fee: w.fee.toString(),
          netAmount: w.netAmount.toString(),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      logger.error('Error fetching withdrawals:', error);
      return { success: false, error: 'Failed to fetch withdrawals' };
    }
  }

  async approveWithdrawal(withdrawalId: string, adminUserId: string): Promise<ApiResponse<any>> {
    try {
      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'APPROVED',
          processedBy: adminUserId,
          processedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'WITHDRAW_APPROVE',
          entityType: 'Withdrawal',
          entityId: withdrawalId,
        },
      });

      return { success: true, message: 'Withdrawal approved successfully' };
    } catch (error) {
      logger.error('Error approving withdrawal:', error);
      return { success: false, error: 'Failed to approve withdrawal' };
    }
  }

  async rejectWithdrawal(
    withdrawalId: string,
    reason: string,
    adminUserId: string
  ): Promise<ApiResponse<any>> {
    try {
      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          processedBy: adminUserId,
          processedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'WITHDRAW_REJECT',
          entityType: 'Withdrawal',
          entityId: withdrawalId,
          details: { reason },
        },
      });

      return { success: true, message: 'Withdrawal rejected' };
    } catch (error) {
      logger.error('Error rejecting withdrawal:', error);
      return { success: false, error: 'Failed to reject withdrawal' };
    }
  }

  async getConfig(): Promise<ApiResponse<any>> {
    try {
      const configs = await prisma.platformConfig.findMany();
      
      return {
        success: true,
        data: configs.reduce((acc, config) => {
          acc[config.key] = config.value;
          return acc;
        }, {} as Record<string, string>),
      };
    } catch (error) {
      logger.error('Error fetching config:', error);
      return { success: false, error: 'Failed to fetch config' };
    }
  }

  async updatePlatformFee(feePercentage: number, adminUserId: string): Promise<ApiResponse<any>> {
    try {
      await prisma.platformConfig.upsert({
        where: { key: 'PLATFORM_FEE_PERCENTAGE' },
        update: { value: feePercentage.toString() },
        create: {
          key: 'PLATFORM_FEE_PERCENTAGE',
          value: feePercentage.toString(),
          description: 'Platform fee percentage',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'FEE_UPDATE',
          entityType: 'PlatformConfig',
          entityId: 'PLATFORM_FEE_PERCENTAGE',
          details: { feePercentage },
        },
      });

      return { success: true, message: 'Platform fee updated successfully' };
    } catch (error) {
      logger.error('Error updating platform fee:', error);
      return { success: false, error: 'Failed to update platform fee' };
    }
  }

  async getAuditLogs(
    page: number = 1,
    limit: number = 50,
    userId?: string,
    action?: string
  ): Promise<ApiResponse<any>> {
    try {
      const where: any = {};
      
      if (userId) {
        where.userId = userId;
      }
      
      if (action) {
        where.action = action;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { user: { select: { id: true, email: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return {
        success: true,
        data: logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      logger.error('Error fetching audit logs:', error);
      return { success: false, error: 'Failed to fetch audit logs' };
    }
  }
}

export default AdminService;
