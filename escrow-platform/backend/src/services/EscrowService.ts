import prisma from '../config/database';
import logger from '../utils/logger';
import { ApiResponse, TransactionStatus, PaymentMethod } from '../types';
import { Prisma } from '@prisma/client';

class EscrowService {
  private PLATFORM_FEE_PERCENTAGE = 0.02;

  async createEscrow(
    input: {
      title: string;
      description?: string;
      amount: number;
      buyerEmail: string;
      sellerEmail: string;
      paymentMethod: PaymentMethod;
    },
    adminUserId: string
  ): Promise<ApiResponse<any>> {
    const amount = BigInt(Math.round(input.amount));
    const platformFee = BigInt(Math.round(amount * Number(this.PLATFORM_FEE_PERCENTAGE)));
    const totalAmount = amount + platformFee;

    try {
      const result = await prisma.$transaction(async (tx) => {
        let buyer = await tx.user.findUnique({
          where: { email: input.buyerEmail.toLowerCase() },
        });

        if (!buyer) {
          buyer = await tx.user.create({
            data: {
              email: input.buyerEmail.toLowerCase(),
              passwordHash: '',
              fullName: input.buyerEmail.split('@')[0],
              role: 'BUYER',
              isVerified: false,
              wallet: {
                create: {
                  balance: 0n,
                  currency: 'IDR',
                },
              },
            },
          });
        }

        let seller = await tx.user.findUnique({
          where: { email: input.sellerEmail.toLowerCase() },
        });

        if (!seller) {
          seller = await tx.user.create({
            data: {
              email: input.sellerEmail.toLowerCase(),
              passwordHash: '',
              fullName: input.sellerEmail.split('@')[0],
              role: 'SELLER',
              isVerified: false,
              wallet: {
                create: {
                  balance: 0n,
                  currency: 'IDR',
                },
              },
            },
          });
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const transaction = await tx.escrowTransaction.create({
          data: {
            title: input.title,
            description: input.description,
            amount,
            platformFee,
            totalAmount,
            status: 'WAITING_PAYMENT',
            expiresAt,
            participants: {
              create: [
                {
                  userId: buyer.id,
                  role: 'BUYER',
                },
                {
                  userId: seller.id,
                  role: 'SELLER',
                },
              ],
            },
            payments: {
              create: {
                userId: buyer.id,
                method: input.paymentMethod,
                status: 'PENDING',
                amount: totalAmount,
                expiresAt,
              },
            },
          },
          include: {
            participants: {
              include: { user: true },
            },
            payments: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'TRANSACTION_CREATE',
            entityType: 'EscrowTransaction',
            entityId: transaction.id,
            details: {
              title: transaction.title,
              amount: transaction.amount.toString(),
              buyerEmail: input.buyerEmail,
              sellerEmail: input.sellerEmail,
            },
          },
        });

        return transaction;
      });

      return {
        success: true,
        data: {
          id: result.id,
          title: result.title,
          description: result.description,
          amount: result.amount.toString(),
          platformFee: result.platformFee.toString(),
          totalAmount: result.totalAmount.toString(),
          status: result.status,
          expiresAt: result.expiresAt,
          createdAt: result.createdAt,
          buyer: result.participants.find((p) => p.role === 'BUYER')?.user,
          seller: result.participants.find((p) => p.role === 'SELLER')?.user,
          payment: result.payments[0],
        },
        message: 'Escrow transaction created successfully',
      };
    } catch (error) {
      logger.error('Error creating escrow:', error);
      return {
        success: false,
        error: 'Failed to create escrow transaction',
      };
    }
  }

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<ApiResponse<any>> {
    try {
      const where: Prisma.EscrowTransactionWhereInput = {
        participants: {
          some: {
            userId,
          },
        },
        deletedAt: null,
      };

      if (status) {
        where.status = status as TransactionStatus;
      }

      const [transactions, total] = await Promise.all([
        prisma.escrowTransaction.findMany({
          where,
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
              },
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            disputes: {
              where: { status: { not: 'CLOSED' } },
            },
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
          expiresAt: t.expiresAt,
          completedAt: t.completedAt,
          buyer: t.participants.find((p) => p.role === 'BUYER')?.user,
          seller: t.participants.find((p) => p.role === 'SELLER')?.user,
          payment: t.payments[0],
          hasDispute: t.disputes.length > 0,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      return {
        success: false,
        error: 'Failed to fetch transactions',
      };
    }
  }

  async getTransactionById(
    transactionId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: {
          id: transactionId,
          deletedAt: null,
          participants: {
            some: { userId },
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  fullName: true,
                  phone: true,
                },
              },
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
          deliveryProofs: true,
          disputes: {
            include: {
              evidence: true,
            },
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  email: true,
                  fullName: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found',
        };
      }

      const buyer = transaction.participants.find((p) => p.role === 'BUYER');
      const seller = transaction.participants.find((p) => p.role === 'SELLER');

      return {
        success: true,
        data: {
          id: transaction.id,
          title: transaction.title,
          description: transaction.description,
          amount: transaction.amount.toString(),
          platformFee: transaction.platformFee.toString(),
          totalAmount: transaction.totalAmount.toString(),
          status: transaction.status,
          createdAt: transaction.createdAt,
          expiresAt: transaction.expiresAt,
          completedAt: transaction.completedAt,
          buyer: buyer?.user,
          seller: seller?.user,
          payments: transaction.payments,
          deliveryProofs: transaction.deliveryProofs,
          disputes: transaction.disputes,
          messages: transaction.messages,
        },
      };
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      return {
        success: false,
        error: 'Failed to fetch transaction',
      };
    }
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    notes?: string,
    adminUserId?: string
  ): Promise<ApiResponse<any>> {
    try {
      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found',
        };
      }

      const validTransitions: Record<TransactionStatus, TransactionStatus[]> = {
        CREATED: ['WAITING_PAYMENT', 'CANCELLED'],
        WAITING_PAYMENT: ['PAID', 'CANCELLED'],
        PAID: ['DELIVERED', 'DISPUTE', 'REFUNDED'],
        DELIVERED: ['COMPLETED', 'DISPUTE'],
        COMPLETED: [],
        DISPUTE: ['REFUNDED', 'COMPLETED'],
        REFUNDED: [],
        CANCELLED: [],
      };

      if (!validTransitions[transaction.status].includes(status)) {
        return {
          success: false,
          error: `Invalid status transition from ${transaction.status} to ${status}`,
        };
      }

      const updated = await prisma.escrowTransaction.update({
        where: { id: transactionId },
        data: {
          status,
          completedAt: status === 'COMPLETED' || status === 'CANCELLED' || status === 'REFUNDED' 
            ? new Date() 
            : undefined,
        },
        include: {
          participants: { include: { user: true } },
          payments: true,
        },
      });

      if (adminUserId) {
        await prisma.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'TRANSACTION_UPDATE',
            entityType: 'EscrowTransaction',
            entityId: transactionId,
            details: { previousStatus: transaction.status, newStatus: status, notes },
          },
        });
      }

      if (status === 'COMPLETED') {
        await this.releaseFunds(transactionId, updated);
      } else if (status === 'REFUNDED' || status === 'CANCELLED') {
        await this.refundFunds(transactionId, updated);
      }

      return {
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          completedAt: updated.completedAt,
        },
        message: `Transaction status updated to ${status}`,
      };
    } catch (error) {
      logger.error('Error updating transaction status:', error);
      return {
        success: false,
        error: 'Failed to update transaction status',
      };
    }
  }

  async submitDeliveryProof(
    transactionId: string,
    userId: string,
    imageUrl: string,
    description?: string
  ): Promise<ApiResponse<any>> {
    try {
      const participant = await prisma.escrowParticipant.findFirst({
        where: {
          transactionId,
          userId,
          role: 'SELLER',
        },
      });

      if (!participant) {
        return {
          success: false,
          error: 'Only sellers can submit delivery proof',
        };
      }

      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || transaction.status !== 'PAID') {
        return {
          success: false,
          error: 'Cannot submit delivery proof for this transaction',
        };
      }

      const proof = await prisma.deliveryProof.create({
        data: {
          transactionId,
          uploadedBy: userId,
          imageUrl,
          description,
        },
      });

      await prisma.escrowTransaction.update({
        where: { id: transactionId },
        data: { status: 'DELIVERED' },
      });

      return {
        success: true,
        data: proof,
        message: 'Delivery proof submitted successfully',
      };
    } catch (error) {
      logger.error('Error submitting delivery proof:', error);
      return {
        success: false,
        error: 'Failed to submit delivery proof',
      };
    }
  }

  async confirmDelivery(
    transactionId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    try {
      const participant = await prisma.escrowParticipant.findFirst({
        where: {
          transactionId,
          userId,
          role: 'BUYER',
        },
      });

      if (!participant) {
        return {
          success: false,
          error: 'Only buyers can confirm delivery',
        };
      }

      return await this.updateTransactionStatus(transactionId, 'COMPLETED', undefined, userId);
    } catch (error) {
      logger.error('Error confirming delivery:', error);
      return {
        success: false,
        error: 'Failed to confirm delivery',
      };
    }
  }

  async openDispute(
    transactionId: string,
    userId: string,
    reason: string,
    description: string
  ): Promise<ApiResponse<any>> {
    try {
      const participant = await prisma.escrowParticipant.findFirst({
        where: {
          transactionId,
          userId,
        },
      });

      if (!participant) {
        return {
          success: false,
          error: 'You are not a participant in this transaction',
        };
      }

      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || !['PAID', 'DELIVERED'].includes(transaction.status)) {
        return {
          success: false,
          error: 'Cannot open dispute for this transaction status',
        };
      }

      const dispute = await prisma.$transaction(async (tx) => {
        await tx.escrowTransaction.update({
          where: { id: transactionId },
          data: { status: 'DISPUTE' },
        });

        return tx.dispute.create({
          data: {
            transactionId,
            openedBy: userId,
            reason,
            description,
            status: 'OPEN',
          },
          include: {
            transaction: {
              include: {
                participants: { include: { user: true } },
              },
            },
          },
        });
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'DISPUTE_OPEN',
          entityType: 'Dispute',
          entityId: dispute.id,
          details: { transactionId, reason },
        },
      });

      return {
        success: true,
        data: dispute,
        message: 'Dispute opened successfully',
      };
    } catch (error) {
      logger.error('Error opening dispute:', error);
      return {
        success: false,
        error: 'Failed to open dispute',
      };
    }
  }

  async cancelTransaction(
    transactionId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    try {
      const participant = await prisma.escrowParticipant.findFirst({
        where: {
          transactionId,
          userId,
          role: 'BUYER',
        },
      });

      if (!participant) {
        return {
          success: false,
          error: 'Only buyers can cancel transactions',
        };
      }

      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || transaction.status !== 'WAITING_PAYMENT') {
        return {
          success: false,
          error: 'Can only cancel unpaid transactions',
        };
      }

      return await this.updateTransactionStatus(transactionId, 'CANCELLED', undefined, userId);
    } catch (error) {
      logger.error('Error cancelling transaction:', error);
      return {
        success: false,
        error: 'Failed to cancel transaction',
      };
    }
  }

  private async releaseFunds(
    transactionId: string,
    transaction: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const sellerParticipant = transaction.participants.find(
        (p: any) => p.role === 'SELLER'
      );

      if (!sellerParticipant) return;

      const sellerWallet = await tx.wallet.findUnique({
        where: { userId: sellerParticipant.userId },
      });

      if (!sellerWallet) return;

      const netAmount = transaction.amount;

      await tx.wallet.update({
        where: { id: sellerWallet.id },
        data: {
          balance: sellerWallet.balance + netAmount,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: sellerWallet.id,
          type: 'ESCROW_RELEASE',
          amount: netAmount,
          balanceBefore: sellerWallet.balance,
          balanceAfter: sellerWallet.balance + netAmount,
          referenceType: 'EscrowTransaction',
          referenceId: transactionId,
          description: `Funds released from escrow: ${transaction.title}`,
        },
      });

      const platformWallet = await tx.wallet.findFirst({
        where: {
          user: {
            email: process.env.PLATFORM_WALLET_EMAIL || 'platform@escrow.com',
          },
        },
      });

      if (platformWallet && transaction.platformFee > 0n) {
        await tx.wallet.update({
          where: { id: platformWallet.id },
          data: {
            balance: platformWallet.balance + transaction.platformFee,
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: platformWallet.id,
            type: 'PLATFORM_FEE',
            amount: transaction.platformFee,
            balanceBefore: platformWallet.balance,
            balanceAfter: platformWallet.balance + transaction.platformFee,
            referenceType: 'EscrowTransaction',
            referenceId: transactionId,
            description: `Platform fee from transaction: ${transaction.title}`,
          },
        });
      }
    });
  }

  private async refundFunds(
    transactionId: string,
    transaction: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const buyerParticipant = transaction.participants.find(
        (p: any) => p.role === 'BUYER'
      );

      if (!buyerParticipant) return;

      const buyerWallet = await tx.wallet.findUnique({
        where: { userId: buyerParticipant.userId },
      });

      if (!buyerWallet) return;

      const refundAmount = transaction.totalAmount;

      await tx.wallet.update({
        where: { id: buyerWallet.id },
        data: {
          balance: buyerWallet.balance + refundAmount,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: buyerWallet.id,
          type: 'REFUND',
          amount: refundAmount,
          balanceBefore: buyerWallet.balance,
          balanceAfter: buyerWallet.balance + refundAmount,
          referenceType: 'EscrowTransaction',
          referenceId: transactionId,
          description: `Refund from cancelled/refunded transaction: ${transaction.title}`,
        },
      });
    });
  }
}

export default EscrowService;
