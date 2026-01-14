import { useWallet } from '@aptos-labs/wallet-adapter-react';

export function StatusDisplay() {
  const { connected, wallet } = useWallet();

  return (
    <div className="flex items-center gap-2 glass-subtle px-3 py-1.5 rounded-full">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-white/30'
        }`}
      ></div>
      <span className="text-sm text-white/60">
        {connected ? wallet?.name || 'Connected' : 'Not Connected'}
      </span>
    </div>
  );
}
