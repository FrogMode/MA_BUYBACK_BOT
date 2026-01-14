import { useState } from 'react';
import { useApi } from '../hooks/useApi';

interface WalletSetupProps {
  address: string | null;
  onWalletConfigured: (address: string) => void;
}

export function WalletSetup({ address, onWalletConfigured }: WalletSetupProps) {
  const [importKey, setImportKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState<string | null>(null);
  const { generateWallet, importWallet, loading, error } = useApi();

  const handleGenerate = async () => {
    const result = await generateWallet();
    if (result.success && result.data) {
      setGeneratedPrivateKey(result.data.privateKey);
      onWalletConfigured(result.data.address);
    }
  };

  const handleImport = async () => {
    if (!importKey.trim()) return;
    const result = await importWallet(importKey.trim());
    if (result.success && result.data) {
      setImportKey('');
      onWalletConfigured(result.data.address);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Wallet Setup</h2>

      {address ? (
        <div className="space-y-4">
          <div>
            <label className="label">Deposit Address</label>
            <div className="flex items-center gap-2">
              <code className="bg-gray-700 px-3 py-2 rounded flex-1 text-sm break-all">
                {address}
              </code>
              <button
                onClick={() => copyToClipboard(address)}
                className="btn-secondary text-sm"
              >
                Copy
              </button>
            </div>
          </div>

          {generatedPrivateKey && (
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
              <p className="text-yellow-400 text-sm font-medium mb-2">
                Save your private key securely. You won't see it again!
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-gray-900 px-3 py-2 rounded flex-1 text-sm break-all">
                  {showPrivateKey ? generatedPrivateKey : '••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="btn-secondary text-sm"
                >
                  {showPrivateKey ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={() => copyToClipboard(generatedPrivateKey)}
                  className="btn-secondary text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Generate New Wallet</h3>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Generating...' : 'Generate New Wallet'}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-400">or</span>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Import Existing Wallet</h3>
            <div className="space-y-3">
              <input
                type="password"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                placeholder="Enter private key (hex)"
                className="input w-full"
              />
              <button
                onClick={handleImport}
                disabled={loading || !importKey.trim()}
                className="btn-primary w-full"
              >
                {loading ? 'Importing...' : 'Import Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
