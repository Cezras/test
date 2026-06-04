export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthRequest {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export type TransactionStatus = 
  | 'CREATED'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DISPUTE'
  | 'REFUNDED'
  | 'CANCELLED';

export type PaymentMethod = 
  | 'QRIS'
  | 'DANA'
  | 'BCA_VA'
  | 'BNI_VA'
  | 'MANDIRI_VA'
  | 'BRI_VA'
  | 'MANUAL_TRANSFER';

export type PaymentStatus = 
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED';

export type UserRole = 'ADMIN' | 'BUYER' | 'SELLER';

export interface PaymentGatewayConfig {
  provider: 'midtrans' | 'xendit' | 'doku';
  serverKey: string;
  clientKey?: string;
  isProduction: boolean;
}

export interface CreateEscrowInput {
  title: string;
  description?: string;
  amount: bigint;
  buyerEmail: string;
  sellerEmail: string;
  paymentMethod: PaymentMethod;
}

export interface UpdateTransactionStatusInput {
  status: TransactionStatus;
  notes?: string;
}

export interface DisputeInput {
  reason: string;
  description: string;
}

export interface WithdrawalInput {
  bankAccountId: string;
  amount: bigint;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
