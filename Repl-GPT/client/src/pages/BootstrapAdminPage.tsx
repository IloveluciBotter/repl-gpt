import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";
import { Loader2, CheckCircle2, AlertCircle, Shield } from "lucide-react";

export function BootstrapAdminPage() {
  const { wallet, connect } = useWallet();
  const [status, setStatus] = useState<"loading" | "allowed" | "not-allowed" | null>(null);
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    api.admin
      .bootstrapStatus()
      .then((r) => setStatus(r.bootstrapAllowed ? "allowed" : "not-allowed"))
      .catch(() => setStatus("not-allowed"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.admin.bootstrap(key);
      setResult({
        success: true,
        message: `Success! ${res.user.username} is now an admin. Refresh the page to see the Admin menu.`,
      });
      setStatus("not-allowed");
      setKey("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Bootstrap failed";
      setResult({ success: false, message });
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" || status === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (status === "not-allowed") {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 rounded-lg bg-gray-900 border border-gray-800">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Shield className="w-5 h-5" />
          <h2 className="text-lg font-medium">Bootstrap Admin</h2>
        </div>
        <p className="text-gray-400">
          Bootstrap is not available. An admin already exists.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 rounded-lg bg-gray-900 border border-gray-800">
      <div className="flex items-center gap-2 text-purple-400 mb-4">
        <Shield className="w-5 h-5" />
        <h2 className="text-lg font-medium">Bootstrap First Admin</h2>
      </div>

      {!wallet.authenticated ? (
        <div className="space-y-4">
          <p className="text-gray-400">
            Connect your wallet and sign in first. The bootstrap key will promote your logged-in account to admin.
          </p>
          <button
            type="button"
            onClick={() => connect()}
            className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bootstrap-key" className="block text-sm text-gray-400 mb-1">
              Bootstrap key
            </label>
            <input
              id="bootstrap-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter BOOTSTRAP_ADMIN_KEY"
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              autoComplete="off"
            />
          </div>

          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                result.success ? "bg-green-900/30 text-green-400 border border-green-800" : "bg-red-900/30 text-red-400 border border-red-800"
              }`}
            >
              {result.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
              <span>{result.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !key.trim()}
            className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Bootstrap Admin
          </button>
        </form>
      )}
    </div>
  );
}
