import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { authLimiter, validateRequest, asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';
import AuthService from '../services/AuthService';
import logger from '../utils/logger';

const router = Router();
const authService = new AuthService();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(['BUYER', 'SELLER']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const verifyEmailSchema = z.object({
  token: z.string(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
});

router.post(
  '/register',
  authLimiter,
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  })
);

router.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  })
);

router.post(
  '/verify-email',
  validateRequest(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.verifyEmail(req.body.token);
    res.json(result);
  })
);

router.post(
  '/resend-verification',
  authLimiter,
  validateRequest(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const result = await authService.resendVerification(req.body.email);
    res.json(result);
  })
);

router.post(
  '/forgot-password',
  authLimiter,
  validateRequest(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email);
    res.json(result);
  })
);

router.post(
  '/reset-password',
  authLimiter,
  validateRequest(z.object({
    token: z.string(),
    password: z.string().min(8),
  })),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body.token, req.body.password);
    res.json(result);
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await authService.getProfile(req.user!.userId);
    res.json(result);
  })
);

router.put(
  '/profile',
  authenticate,
  validateRequest(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.updateProfile(req.user!.userId, req.body);
    res.json(result);
  })
);

router.post(
  '/change-password',
  authenticate,
  validateRequest(z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8),
  })),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword(
      req.user!.userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    res.json(result);
  })
);

export default router;
