import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest, asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';
import AdminService from '../services/AdminService';

const router = Router();
const adminService = new AdminService();

const resolveDisputeSchema = z.object({
  resolution: z.enum(['RELEASE_TO_SELLER', 'REFUND_BUYER', 'PARTIAL_SETTLEMENT']),
  settlementAmount: z.number().optional(),
  notes: z.string().optional(),
});

const suspendUserSchema = z.object({
  reason: z.string().min(10),
});

const updateFeeSchema = z.object({
  feePercentage: z.number().min(0).max(10),
});

router.get(
  '/dashboard',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.getDashboardStats();
    res.json(result);
  })
);

router.get(
  '/transactions',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    
    const result = await adminService.getAllTransactions(page, limit, status);
    res.json(result);
  })
);

router.get(
  '/transactions/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.getTransactionById(req.params.id);
    res.json(result);
  })
);

router.patch(
  '/transactions/:id/status',
  authenticate,
  authorize('ADMIN'),
  validateRequest(z.object({
    status: z.enum(['CREATED', 'WAITING_PAYMENT', 'PAID', 'DELIVERED', 'COMPLETED', 'DISPUTE', 'REFUNDED', 'CANCELLED']),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const result = await adminService.updateTransactionStatus(
      req.params.id,
      req.body.status,
      req.body.notes,
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/disputes',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    
    const result = await adminService.getDisputes(page, limit, status);
    res.json(result);
  })
);

router.get(
  '/disputes/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.getDisputeById(req.params.id);
    res.json(result);
  })
);

router.post(
  '/disputes/:id/resolve',
  authenticate,
  authorize('ADMIN'),
  validateRequest(resolveDisputeSchema),
  asyncHandler(async (req, res) => {
    const result = await adminService.resolveDispute(
      req.params.id,
      req.body.resolution,
      req.body.settlementAmount,
      req.body.notes,
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/users',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string | undefined;
    
    const result = await adminService.getUsers(page, limit, role);
    res.json(result);
  })
);

router.get(
  '/users/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.getUserById(req.params.id);
    res.json(result);
  })
);

router.post(
  '/users/:id/suspend',
  authenticate,
  authorize('ADMIN'),
  validateRequest(suspendUserSchema),
  asyncHandler(async (req, res) => {
    const result = await adminService.suspendUser(
      req.params.id,
      req.body.reason,
      req.user!.userId
    );
    res.json(result);
  })
);

router.post(
  '/users/:id/unsuspend',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.unsuspendUser(
      req.params.id,
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/withdrawals',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    
    const result = await adminService.getWithdrawals(page, limit, status);
    res.json(result);
  })
);

router.post(
  '/withdrawals/:id/approve',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.approveWithdrawal(
      req.params.id,
      req.user!.userId
    );
    res.json(result);
  })
);

router.post(
  '/withdrawals/:id/reject',
  authenticate,
  authorize('ADMIN'),
  validateRequest(z.object({
    reason: z.string().min(10),
  })),
  asyncHandler(async (req, res) => {
    const result = await adminService.rejectWithdrawal(
      req.params.id,
      req.body.reason,
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/config',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await adminService.getConfig();
    res.json(result);
  })
);

router.put(
  '/config/fee',
  authenticate,
  authorize('ADMIN'),
  validateRequest(updateFeeSchema),
  asyncHandler(async (req, res) => {
    const result = await adminService.updatePlatformFee(
      req.body.feePercentage,
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/audit-logs',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const userId = req.query.userId as string | undefined;
    const action = req.query.action as string | undefined;
    
    const result = await adminService.getAuditLogs(page, limit, userId, action);
    res.json(result);
  })
);

export default router;
