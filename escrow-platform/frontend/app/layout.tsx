import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Escrow Platform - Secure Transactions',
  description: 'Production-ready escrow platform for Indonesian payments',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <span className="text-xl font-bold text-gray-900">Escrow</span>
              </div>
              <div className="flex items-center space-x-4">
                <a href="/auth/login" className="text-gray-700 hover:text-gray-900">
                  Login
                </a>
                <a href="/auth/register" className="btn-primary">
                  Register
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
