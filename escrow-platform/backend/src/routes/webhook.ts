import { Router } from 'express';
import PaymentService from '../services/PaymentService';

const router = Router();
const paymentService = new PaymentService();

router.post('/midtrans', async (req, res) => {
  try {
    const signature = req.headers['x-midtrans-signature'] as string;
    const result = await paymentService.processWebhook('midtrans', req.body, signature);
    
    if (result.success) {
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/xendit', async (req, res) => {
  try {
    const signature = req.headers['x-callback-token'] as string;
    const result = await paymentService.processWebhook('xendit', req.body, signature);
    
    if (result.success) {
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
