import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest, asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';
import PaymentService from '../services/PaymentService';

const router = Router();
const paymentService = new PaymentService();

const initiatePaymentSchema = z.object({
  transactionId: z.string(),
  method: z.enum(['QRIS', 'DANA', 'BCA_VA', 'BNI_VA', 'MANDIRI_VA', 'BRI_VA', 'MANUAL_TRANSFER']),
});

const uploadProofSchema = z.object({
  imageUrl: z.string().url(),
});

router.post(
  '/initiate',
  authenticate,
  validateRequest(initiatePaymentSchema),
  asyncHandler(async (req, res) => {
    const result = await paymentService.initiatePayment(
      req.body.transactionId,
      req.user!.userId,
      req.body.method
    );
    res.json(result);
  })
);

router.get(
  '/:id/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await paymentService.getPaymentStatus(req.params.id, req.user!.userId);
    res.json(result);
  })
);

router.post(
  '/manual/upload-proof',
  authenticate,
  validateRequest(uploadProofSchema),
  asyncHandler(async (req, res) => {
    const paymentId = req.body.paymentId;
    const imageUrl = req.body.imageUrl;
    
    const result = await paymentService.uploadManualTransferProof(
      paymentId,
      req.user!.userId,
      imageUrl
    );
    res.json(result);
  })
);

export default router;
