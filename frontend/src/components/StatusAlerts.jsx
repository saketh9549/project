import React from 'react';

export default function StatusAlerts({ errorMsg, successMsg }) {
  if (!errorMsg && !successMsg) return null;

  return (
    <div className="max-w-md text-sm">
      {errorMsg && (
        <div className="bg-red-950/40 border border-red-500/30 text-red-300 px-4 py-2 rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse-glow">
          <span className="h-2 w-2 rounded-full bg-red-500"></span>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 px-4 py-2 rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
          {successMsg}
        </div>
      )}
    </div>
  );
}
