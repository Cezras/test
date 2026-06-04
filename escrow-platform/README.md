# Escrow Platform - Production-Ready Indonesian Payment System

A production-ready escrow (midman) website for third-party transactions using Indonesian local payments.

## Project Structure

```
escrow-platform/
├── backend/                    # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/            # Database and configuration
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Auth, validation, error handling
│   │   ├── routes/            # API route definitions
│   │   ├── services/          # Business logic layer
│   │   ├── repositories/      # Data access layer
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Utilities and helpers
│   └── tsconfig.json
├── frontend/                   # Next.js 15 + Tailwind CSS
│   ├── app/                   # App Router pages
│   │   ├── auth/              # Login/Register pages
│   │   ├── dashboard/         # User dashboard
│   │   ├── transactions/      # Transaction management
│   │   └── admin/             # Admin panel
│   ├── components/            # Reusable UI components
│   ├── lib/                   # API clients and utilities
│   └── types/                 # TypeScript types
├── prisma/
│   └── schema.prisma          # Database schema
└── logs/                      # Application logs
```

## REST API Endpoints

### Authentication
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login
- POST /api/auth/verify-email - Verify email
- POST /api/auth/resend-verification - Resend verification email
- POST /api/auth/forgot-password - Request password reset
- POST /api/auth/reset-password - Reset password
- GET /api/auth/me - Get current user profile
- PUT /api/auth/profile - Update profile
- POST /api/auth/change-password - Change password

### Escrow Transactions
- POST /api/escrow - Create escrow transaction (Admin)
- GET /api/escrow - List user transactions
- GET /api/escrow/:id - Get transaction details
- PATCH /api/escrow/:id/status - Update status (Admin)
- POST /api/escrow/:id/deliver - Submit delivery proof
- POST /api/escrow/:id/confirm-delivery - Confirm delivery
- POST /api/escrow/:id/dispute - Open dispute
- POST /api/escrow/:id/cancel - Cancel transaction

### Payments
- POST /api/payment/initiate - Initiate payment
- GET /api/payment/:id/status - Get payment status
- POST /api/payment/manual/upload-proof - Upload transfer proof

### Admin Panel
- GET /api/admin/dashboard - Dashboard statistics
- GET /api/admin/transactions - All transactions
- GET /api/admin/transactions/:id - Transaction details
- PATCH /api/admin/transactions/:id/status - Update status
- GET /api/admin/disputes - All disputes
- GET /api/admin/disputes/:id - Dispute details
- POST /api/admin/disputes/:id/resolve - Resolve dispute
- GET /api/admin/users - All users
- GET /api/admin/users/:id - User details
- POST /api/admin/users/:id/suspend - Suspend user
- POST /api/admin/users/:id/unsuspend - Unsuspend user
- GET /api/admin/withdrawals - All withdrawals
- POST /api/admin/withdrawals/:id/approve - Approve withdrawal
- POST /api/admin/withdrawals/:id/reject - Reject withdrawal
- GET /api/admin/config - Get platform config
- PUT /api/admin/config/fee - Update platform fee
- GET /api/admin/audit-logs - Audit logs

### Webhooks
- POST /api/webhook/midtrans - Midtrans webhook
- POST /api/webhook/xendit - Xendit webhook

## Escrow State Machine

```
CREATED → WAITING_PAYMENT → PAID → DELIVERED → COMPLETED
                         ↓           ↓
                    CANCELLED    DISPUTE → RESOLVED
                                      ↓
                                 REFUNDED
```

## Payment Methods Supported

- QRIS (QR Code)
- DANA (E-wallet)
- Virtual Accounts: BCA, BNI, Mandiri, BRI
- Manual Bank Transfer (with proof upload)

## Security Features

1. **Authentication**: JWT-based with secure token handling
2. **Password Hashing**: bcrypt with 12 salt rounds
3. **Rate Limiting**: API endpoints protected from abuse
4. **Input Validation**: Zod schemas for all inputs
5. **SQL Injection Prevention**: Prisma ORM parameterized queries
6. **XSS Protection**: Helmet middleware
7. **CORS**: Configured for specific origins
8. **Audit Logging**: All actions logged
9. **Role-Based Access Control**: Admin, Buyer, Seller roles
10. **Transaction Safety**: Database transactions for fund operations

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone repository and install dependencies:
```bash
cd escrow-platform
npm install
cd frontend && npm install && cd ..
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure database in .env:
```
DATABASE_URL="postgresql://user:password@localhost:5432/escrow_db"
```

4. Run database migrations:
```bash
npx prisma migrate dev
npx prisma generate
```

5. Start development servers:
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Production Deployment

1. Build applications:
```bash
npm run build:backend
npm run build:frontend
```

2. Set production environment variables
3. Run migrations: `npx prisma migrate deploy`
4. Start servers with process manager (PM2 recommended)

## Environment Variables

See `.env.example` for all required variables.

## Payment Gateway Integration

The system supports multiple payment gateways through abstraction:

- **Midtrans**: Configure server key in .env
- **Xendit**: Configure secret key in .env
- **DOKU**: Configure merchant ID and secret key

Webhooks are handled automatically to update payment statuses.

## License

MIT
