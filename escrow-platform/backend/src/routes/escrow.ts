import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest, asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';
import EscrowService from '../services/EscrowService';

const router = Router();
const escrowService = new EscrowService();

const createEscrowSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  amount: z.number().positive(),
  buyerEmail: z.string().email(),
  sellerEmail: z.string().email(),
  paymentMethod: z.enum(['QRIS', 'DANA', 'BCA_VA', 'BNI_VA', 'MANDIRI_VA', 'BRI_VA', 'MANUAL_TRANSFER']),
});

const updateStatusSchema = z.object({
  status: z.enum(['CREATED', 'WAITING_PAYMENT', 'PAID', 'DELIVERED', 'COMPLETED', 'DISPUTE', 'REFUNDED', 'CANCELLED']),
  notes: z.string().optional(),
});

router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(createEscrowSchema),
  asyncHandler(async (req, res) => {
    const result = await escrowService.createEscrow(req.body, req.user!.userId);
    res.status(201).json(result);
  })
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string | undefined;
    
    const result = await escrowService.getUserTransactions(
      req.user!.userId,
      page,
      limit,
      status
    );
    res.json(result);
  })
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await escrowService.getTransactionById(req.params.id, req.user!.userId);
    res.json(result);
  })
);

router.patch(
  '/:id/status',
  authenticate,
  authorize('ADMIN'),
  validateRequest(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const result = await escrowService.updateTransactionStatus(
      req.params.id,
      req.body.status,
      req.body.notes,
      req.user!.userId
    );
    res.json(result);
  })
);

router.post(
  '/:id/deliver',
  authenticate,
  asyncHandler(async (req, res) => {
    const imageUrl = req.body.imageUrl;
    const description = req.body.description;
    
    const result = await escrowService.submitDeliveryProof(
      req.params.id,
      req.user!.userId,
      imageUrl,
      description
    );
    res.json(result);
  })
);

router.post(
  '/:id/confirm-delivery',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await escrowService.confirmDelivery(
      req.params.id,
      req.user!.userId
    );
    res.json(result);
  })
);

router.post(
  '/:id/dispute',
  authenticate,
  validateRequest(z.object({
    reason: z.string().min(10),
    description: z.string().min(20),
  })),
  asyncHandler(async (req, res) => {
    const result = await escrowService.openDispute(
      req.params.id,
      req.user!.userId,
      req.body.reason,
      req.body.description
    );
    res.json(result);
  })
);

router.post(
  '/:id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await escrowService.cancelTransaction(
      req.params.id,
      req.user!.userId
    );
    res.json(result);
  })
);

export default router;
