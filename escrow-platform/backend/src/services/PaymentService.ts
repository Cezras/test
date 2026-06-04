import prisma from '../config/database';
import logger from '../utils/logger';
import { ApiResponse, PaymentMethod } from '../types';

class PaymentService {
  async initiatePayment(
    transactionId: string,
    userId: string,
    method: PaymentMethod
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
          error: 'You are not the buyer in this transaction',
        };
      }

      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
        include: { payments: true },
      });

      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found',
        };
      }

      if (transaction.status !== 'WAITING_PAYMENT') {
        return {
          success: false,
          error: `Cannot initiate payment for transaction with status: ${transaction.status}`,
        };
      }

      let payment = transaction.payments.find((p) => p.status === 'PENDING');

      if (!payment) {
        payment = await prisma.payment.create({
          data: {
            transactionId,
            userId,
            method,
            status: 'PENDING',
            amount: transaction.totalAmount,
            expiresAt: transaction.expiresAt,
          },
        });
      } else {
        payment = await prisma.payment.update({
          where: { id: payment.id },
          data: { method },
        });
      }

      let paymentDetails: any = {};

      if (['BCA_VA', 'BNI_VA', 'MANDIRI_VA', 'BRI_VA'].includes(method)) {
        const vaNumber = this.generateVANumber(method);
        paymentDetails.vaNumber = vaNumber;
        
        await prisma.payment.update({
          where: { id: payment.id },
          data: { 
            vaNumber,
            gatewayReference: `VA-${method}-${payment.id}` 
          },
        });
      } else if (method === 'QRIS' || method === 'DANA') {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${payment.id}`;
        paymentDetails.qrCodeUrl = qrCodeUrl;
        
        await prisma.payment.update({
          where: { id: payment.id },
          data: { qrCodeUrl },
        });
      }

      return {
        success: true,
        data: {
          paymentId: payment.id,
          method: payment.method,
          amount: payment.amount.toString(),
          status: payment.status,
          expiresAt: payment.expiresAt,
          ...paymentDetails,
        },
        message: 'Payment initiated successfully',
      };
    } catch (error) {
      logger.error('Error initiating payment:', error);
      return {
        success: false,
        error: 'Failed to initiate payment',
      };
    }
  }

  async getPaymentStatus(
    paymentId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    try {
      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          userId,
        },
        include: {
          transaction: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

      if (!payment) {
        return {
          success: false,
          error: 'Payment not found',
        };
      }

      return {
        success: true,
        data: {
          id: payment.id,
          method: payment.method,
          status: payment.status,
          amount: payment.amount.toString(),
          vaNumber: payment.vaNumber,
          qrCodeUrl: payment.qrCodeUrl,
          paidAt: payment.paidAt,
          expiresAt: payment.expiresAt,
          transaction: payment.transaction,
        },
      };
    } catch (error) {
      logger.error('Error fetching payment status:', error);
      return {
        success: false,
        error: 'Failed to fetch payment status',
      };
    }
  }

  async uploadManualTransferProof(
    paymentId: string,
    userId: string,
    imageUrl: string
  ): Promise<ApiResponse<any>> {
    try {
      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          userId,
          method: 'MANUAL_TRANSFER',
        },
      });

      if (!payment) {
        return {
          success: false,
          error: 'Payment not found or not a manual transfer',
        };
      }

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          proofImageUrl: imageUrl,
          status: 'PENDING',
        },
      });

      return {
        success: true,
        message: 'Proof uploaded successfully. Awaiting admin verification.',
      };
    } catch (error) {
      logger.error('Error uploading proof:', error);
      return {
        success: false,
        error: 'Failed to upload proof',
      };
    }
  }

  async processWebhook(
    provider: string,
    payload: any,
    signature: string
  ): Promise<ApiResponse<any>> {
    try {
      let paymentId: string | null = null;
      let status: string | null = null;

      if (provider === 'midtrans') {
        paymentId = payload.order_id;
        status = payload.transaction_status;
      } else if (provider === 'xendit') {
        paymentId = payload.external_id;
        status = payload.status;
      }

      if (!paymentId || !status) {
        return {
          success: false,
          error: 'Invalid webhook payload',
        };
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { transaction: true },
      });

      if (!payment) {
        return {
          success: false,
          error: 'Payment not found',
        };
      }

      let newStatus: 'SUCCESS' | 'FAILED' | 'EXPIRED' | null = null;

      if (['capture', 'settlement'].includes(status)) {
        newStatus = 'SUCCESS';
      } else if (['deny', 'failure', 'refused'].includes(status)) {
        newStatus = 'FAILED';
      } else if (['expire', 'expired'].includes(status)) {
        newStatus = 'EXPIRED';
      }

      if (!newStatus) {
        return {
          success: true,
          message: 'Webhook received but no action needed',
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId! },
          data: {
            status: newStatus!,
            paidAt: newStatus === 'SUCCESS' ? new Date() : undefined,
            gatewayResponse: payload,
          },
        });

        if (newStatus === 'SUCCESS' && payment.transaction.status === 'WAITING_PAYMENT') {
          await tx.escrowTransaction.update({
            where: { id: payment.transactionId },
            data: { status: 'PAID' },
          });
        }
      });

      logger.info(`Payment webhook processed: ${paymentId} - ${newStatus}`);

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      logger.error('Error processing webhook:', error);
      return {
        success: false,
        error: 'Failed to process webhook',
      };
    }
  }

  private generateVANumber(method: PaymentMethod): string {
    const prefixes: Record<string, string> = {
      BCA_VA: '8808',
      BNI_VA: '8809',
      MANDIRI_VA: '8810',
      BRI_VA: '8811',
    };

    const prefix = prefixes[method] || '8808';
    const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    
    return `${prefix}${randomPart}`;
  }
}

export default PaymentService;
