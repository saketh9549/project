import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/api';

export default function ChangePasswordPage({ currentUser, showSuccess, showError }) {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (newPassword === oldPassword) {
      setErrorMsg('New password cannot be identical to current password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          old_password: oldPassword,
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update password.');
      }

      setSuccessMsg('Password updated successfully! Redirecting...');
      showSuccess('Password updated successfully!');
      setTimeout(() => {
        navigate('/home');
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message);
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.08)] border border-white/5 flex flex-col relative overflow-hidden bg-gradient-to-br from-indigo-950/10 to-slate-900/10 animate-quiz-slide">
        
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl" />

        <div className="flex flex-col items-center mb-8 shrink-0 relative">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-lg">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight font-display">Change Password</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1.5 font-sans">
            Account: {currentUser?.username || currentUser?.email}
          </p>
        </div>

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
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password..."
              disabled={loading}
              className="px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all font-sans"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password..."
              disabled={loading}
              className="px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all font-sans"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password..."
              disabled={loading}
              className="px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all font-sans"
            />
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => navigate('/home')}
              disabled={loading}
              className="flex-1 py-3 border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 font-semibold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
