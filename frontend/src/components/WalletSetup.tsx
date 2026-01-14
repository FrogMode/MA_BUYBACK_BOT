import { useWallet, WalletReadyState } from "@aptos-labs/wallet-adapter-react";

export function WalletSetup() {
  const {
    connected,
    account,
    wallets,
    connect,
    disconnect,
  } = useWallet();

  const address = account?.address?.toString() || '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleConnect = async (walletName: string) => {
    try {
      await connect(walletName);
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const installedWallets = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.Installed
  );

  const notInstalledWallets = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.NotDetected
  );

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gradient mb-4">Wallet</h2>

      {connected && address ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-movement-yellow/20 flex items-center justify-center">
              <span className="text-movement-yellow font-bold">
                {address.slice(2, 4).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-white/50">Connected</p>
              <p className="font-mono text-sm text-white truncate">
                {address.slice(0, 8)}...{address.slice(-6)}
              </p>
            </div>
          </div>

          <div>
            <label className="label">Deposit Address</label>
            <div className="flex items-center gap-2">
              <code className="glass-subtle px-3 py-2.5 rounded-lg flex-1 text-sm break-all text-white/80 font-mono">
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

          <button
            onClick={handleDisconnect}
            className="btn-danger w-full"
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-white/60 text-sm mb-4">
            Connect your wallet to start using the TWAP bot
          </p>

          {installedWallets.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wide">Installed Wallets</p>
              {installedWallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => handleConnect(wallet.name)}
                  className="w-full glass-subtle hover:bg-white/5 rounded-xl p-4 flex items-center gap-3 transition-all"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-8 h-8 rounded-lg"
                  />
                  <span className="font-medium text-white">{wallet.name}</span>
                  <span className="ml-auto text-xs text-green-400">Installed</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="glass-subtle rounded-xl p-6 text-center">
              <p className="text-white/70 mb-4">No wallets detected</p>
              <p className="text-sm text-white/50 mb-4">
                Install a compatible wallet to continue
              </p>
              <a
                href="https://nightly.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-block"
              >
                Get Nightly Wallet
              </a>
            </div>
          )}

          {notInstalledWallets.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs text-white/40 uppercase tracking-wide">Other Wallets</p>
              {notInstalledWallets.slice(0, 3).map((wallet) => (
                <a
                  key={wallet.name}
                  href={wallet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full glass-subtle hover:bg-white/5 rounded-xl p-4 flex items-center gap-3 transition-all block"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-8 h-8 rounded-lg opacity-50"
                  />
                  <span className="font-medium text-white/60">{wallet.name}</span>
                  <span className="ml-auto text-xs text-white/40">Install</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
