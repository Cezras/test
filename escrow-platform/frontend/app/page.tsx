export default function HomePage() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Secure Escrow Transactions
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Trusted platform for safe online transactions in Indonesia
      </p>
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Secure Payments</h3>
          <p className="text-gray-600">
            Funds are held securely until both parties fulfill their obligations
          </p>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Local Payment Methods</h3>
          <p className="text-gray-600">
            Support for QRIS, DANA, and all major Indonesian bank transfers
          </p>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Dispute Resolution</h3>
          <p className="text-gray-600">
            Fair mediation process with admin oversight for all disputes
          </p>
        </div>
      </div>
    </div>
  );
}
