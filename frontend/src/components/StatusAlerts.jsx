export default function StatusAlerts({ errorMsg, successMsg, onClear }) {
  if (!errorMsg && !successMsg) return null;

  return (
    <div className="max-w-md text-sm">
      {errorMsg && (
        <div className="bg-red-950/45 border border-red-500/30 text-red-300 pl-4 pr-8 py-2 rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse-glow relative">
          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0"></span>
          <span className="break-words">{errorMsg}</span>
          <button 
            onClick={onClear}
            type="button"
            className="absolute top-1/2 -translate-y-1/2 right-2 p-1 text-red-400 hover:text-red-200 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-indigo-950/45 border border-indigo-500/30 text-indigo-200 pl-4 pr-8 py-2 rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.15)] relative">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping shrink-0"></span>
          <span className="break-words">{successMsg}</span>
          <button 
            onClick={onClear}
            type="button"
            className="absolute top-1/2 -translate-y-1/2 right-2 p-1 text-indigo-400 hover:text-indigo-200 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
