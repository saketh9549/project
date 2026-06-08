import React, { useState, useEffect } from 'react';

export default function AuthModal({ isOpen, onClose, initialMode, onLoginSuccess }) {
  const [mode, setMode] = useState(initialMode || 'login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
    setError('');
    setEmail('');
    setName('');
    setPassword('');
    setConfirmPassword('');
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    // Mock API request delay
    setTimeout(() => {
      setLoading(false);
      onLoginSuccess({
        email: email.trim(),
        name: mode === 'signup' ? name.trim() : email.split('@')[0],
      });
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm cursor-pointer"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col min-h-0 z-10 animate-fade-in">
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Logo Icon */}
        <div className="flex items-center gap-3 mb-6">
          <svg className="h-8 w-8 shadow-[0_0_10px_rgba(11,46,102,0.3)] rounded-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="24" fill="#0b2e66" />
            <text x="50" y="56" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="46" fill="#ffffff" textAnchor="middle">S</text>
            <rect x="14" y="68" width="26" height="16" rx="8" fill="#04204dff" />
            <rect x="28" y="68" width="24" height="16" rx="8" fill="#214376ff" />
            <rect x="42" y="68" width="22" height="16" rx="8" fill="#2e5faaff" />
            <rect x="54" y="68" width="20" height="16" rx="8" fill="#3b6aa1ff" />
            <rect x="64" y="68" width="22" height="16" rx="8" fill="#ffffff" />
          </svg>
          <h2 className="text-lg font-bold font-display tracking-tight text-white uppercase">
            {mode === 'login' ? 'Login to Summarix' : 'Join Summarix'}
          </h2>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-white/5 mb-6 shrink-0">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            type="button"
            className={`flex-1 text-center font-bold font-display py-2.5 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${mode === 'login'
                ? 'text-indigo-400 border-indigo-500 shadow-[inset_0_-2px_0_0_rgb(99,102,241)]'
                : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
          >
            LOG IN
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            type="button"
            className={`flex-1 text-center font-bold font-display py-2.5 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${mode === 'signup'
                ? 'text-indigo-400 border-indigo-500 shadow-[inset_0_-2px_0_0_rgb(99,102,241)]'
                : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
          >
            SIGN UP
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-500/30 text-red-300 px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-400">Full Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400">Email Address</label>
            <input
              type="email"
              placeholder="e.g. user@summarix.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-400">Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
                required
              />
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-indigo-500 to-cyan-400 hover:from-indigo-400 hover:to-cyan-300 text-black font-bold text-xs py-2.5 rounded-lg transition-all shadow-[0_3px_15px_rgba(99,102,241,0.25)] flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <span>{mode === 'login' ? 'LOGIN' : 'SIGN UP'}</span>
            )}
          </button>
        </form>

        {/* Footer Info */}
        <p className="text-[9px] text-gray-500 text-center mt-6">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('signup'); setError(''); }}
                className="text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Log In
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
