interface StatusDisplayProps {
  wsConnected: boolean;
  wsReconnecting: boolean;
}

export function StatusDisplay({ wsConnected, wsReconnecting }: StatusDisplayProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            wsConnected
              ? 'bg-green-500'
              : wsReconnecting
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-red-500'
          }`}
        ></div>
        <span className="text-sm text-gray-400">
          {wsConnected ? 'Connected' : wsReconnecting ? 'Reconnecting...' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
