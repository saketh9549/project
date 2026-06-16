import { useState } from 'react';
import { apiUrl } from '../lib/api';

export default function AuthPage({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('user'); // default role is user
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Basic Validation
    if (isRegister) {
      if (!email || !password || !username) {
        setErrorMsg('Please fill in all required fields.');
        return;
      }
    } else {
      if (!username || !password) {
        setErrorMsg('Please fill in all required fields.');
        return;
      }
    }

    if (isRegister) {
      if (!username.trim()) {
        setErrorMsg('Please specify a username.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password should be at least 6 characters long.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister 
        ? { email, password, role, username: username.trim() } 
        : { username: username.trim(), password };

      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed. Please try again.');
      }

      if (isRegister) {
        setSuccessMsg('Registration successful! You can now log in.');
        setIsRegister(false);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
      } else {
        // Log in success
        const user = {
          email: data.email,
          username: data.username,
          role: data.role,
        };
        localStorage.setItem('summarix_user', JSON.stringify(user));
        onAuthSuccess(user);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.08)] border border-white/5 flex flex-col relative overflow-hidden">

        <div className="flex flex-col items-center mb-8 shrink-0 relative">
          <svg className="h-14 w-14 shadow-[0_0_20px_rgba(11,46,102,0.4)] rounded-2xl mb-4" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="24" fill="#0b2e66" />
            <text x="50" y="56" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="46" fill="#ffffff" textAnchor="middle">S</text>
            <rect x="14" y="68" width="26" height="16" rx="8" fill="#1b4995" />
            <rect x="28" y="68" width="24" height="16" rx="8" fill="#2e69bf" />
            <rect x="42" y="68" width="22" height="16" rx="8" fill="#4b8bec" />
            <rect x="54" y="68" width="20" height="16" rx="8" fill="#7eb2ff" />
            <rect x="64" y="68" width="22" height="16" rx="8" fill="#ffffff" />
          </svg>
          <h2 className="text-2xl font-bold font-display text-white tracking-tight">
            {isRegister ? 'Create Account' : 'Welcome back'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister 
              ? 'Register to index and summarize your media content' 
              : 'Log in to access your media catalogs'
            }
          </p>
        </div>

        {/* Success / Error Banners */}
        {errorMsg && (
          <div className="mb-4 bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isRegister && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Select Account Role</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <label className={`flex items-center justify-center gap-2 border rounded-xl py-3 px-4 cursor-pointer transition-all ${
                  role === 'user'
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 font-semibold'
                    : 'border-white/10 bg-gray-900/60 text-gray-400 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="role"
                    value="user"
                    checked={role === 'user'}
                    onChange={() => setRole('user')}
                    className="sr-only"
                  />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  User
                </label>

                <label className={`flex items-center justify-center gap-2 border rounded-xl py-3 px-4 cursor-pointer transition-all ${
                  role === 'admin'
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 font-semibold'
                    : 'border-white/10 bg-gray-900/60 text-gray-400 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="role"
                    value="admin"
                    checked={role === 'admin'}
                    onChange={() => setRole('admin')}
                    className="sr-only"
                  />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Admin
                </label>
              </div>
            </div>
          )}

          {isRegister ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  disabled={loading}
                  required
                  className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={loading}
                  required
                  className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or Email"
                disabled={loading}
                required
                className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
              className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
            />
          </div>

          {isRegister && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
                className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-semibold rounded-xl py-3.5 shadow-lg hover:shadow-cyan-500/20 active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              isRegister ? 'Register Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                disabled={loading}
                className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline hover:no-underline"
              >
                Log In
              </button>
            </span>
          ) : (
            <span>
              New to Summarix?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                disabled={loading}
                className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline hover:no-underline"
              >
                Create Account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
