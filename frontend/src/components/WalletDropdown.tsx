import { useState, useRef, useEffect } from "react";
import { useWallet, WalletReadyState } from "@aptos-labs/wallet-adapter-react";

export function WalletDropdown() {
  const { connected, account, wallets, connect, disconnect } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const address = account?.address?.toString() || "";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = async (walletName: string) => {
    try {
      await connect(walletName);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const installedWallets = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.Installed
  );

  const notInstalledWallets = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.NotDetected
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
          connected
            ? "glass-subtle hover:bg-white/5"
            : "bg-movement-yellow text-black font-semibold hover:bg-movement-yellow-light"
        }`}
      >
        {connected ? (
          <>
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="font-mono text-sm">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <>
            <span>Connect Wallet</span>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: 9998 }}
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 rounded-xl p-4 shadow-2xl border border-white/10" style={{ zIndex: 9999, backgroundColor: '#0d0d12' }}>
            {connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="w-10 h-10 rounded-full bg-movement-yellow/20 flex items-center justify-center">
                  <span className="text-movement-yellow font-bold">
                    {address.slice(2, 4).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/50">Connected</p>
                  <p className="font-mono text-sm text-white truncate">
                    {address.slice(0, 10)}...{address.slice(-8)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-white/50 mb-1.5">Wallet Address</p>
                <div className="flex items-center gap-2">
                  <code className="glass-subtle px-2 py-1.5 rounded text-xs flex-1 truncate text-white/80 font-mono">
                    {address}
                  </code>
                  <button
                    onClick={() => copyToClipboard(address)}
                    className="btn-secondary text-xs py-1.5 px-2"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                className="btn-danger w-full text-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                Connect your wallet to use the TWAP bot
              </p>

              {installedWallets.length > 0 ? (
                <div className="space-y-2">
                  {installedWallets.map((wallet) => (
                    <button
                      key={wallet.name}
                      onClick={() => handleConnect(wallet.name)}
                      className="w-full glass-subtle hover:bg-white/5 rounded-lg p-3 flex items-center gap-3 transition-all"
                    >
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-6 h-6 rounded"
                      />
                      <span className="font-medium text-white text-sm">{wallet.name}</span>
                      <span className="ml-auto text-xs text-green-400">Ready</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="glass-subtle rounded-lg p-4 text-center">
                  <p className="text-white/70 text-sm mb-2">No wallets detected</p>
                  <a
                    href="https://nightly.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-movement-yellow text-sm hover:underline"
                  >
                    Get Nightly Wallet
                  </a>
                </div>
              )}

              {notInstalledWallets.length > 0 && installedWallets.length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-2">Other Wallets</p>
                  {notInstalledWallets.slice(0, 2).map((wallet) => (
                    <a
                      key={wallet.name}
                      href={wallet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full glass-subtle hover:bg-white/5 rounded-lg p-2 flex items-center gap-2 transition-all mb-1"
                    >
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-5 h-5 rounded opacity-50"
                      />
                      <span className="text-white/60 text-sm">{wallet.name}</span>
                      <span className="ml-auto text-xs text-white/40">Install</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}
