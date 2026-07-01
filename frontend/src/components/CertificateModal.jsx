import { useEffect } from 'react';

export default function CertificateModal({
  isOpen,
  onClose,
  userName,
  userEmail,
  moduleName,
  totalLessons,
  totalQuizzes,
  playlistId
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Generate a mock unique certificate hash
  const generateCertificateId = () => {
    const raw = `${userEmail || 'anonymous'}-${playlistId || 'workspace'}-summarix-cert`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `SMX-CERT-${Math.abs(hash).toString(36).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  };

  const certificateId = generateCertificateId();
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Modal Card */}
      <div className="w-full max-w-4xl bg-gray-900 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-quiz-slide no-print">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎓</span>
            <h3 className="text-base font-extrabold text-white font-display">
              Module Completion Certificate
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer text-sm font-bold w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center border border-transparent"
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Certificate Preview */}
        <div className="flex-1 overflow-x-auto py-4 flex justify-center bg-black/10 rounded-xl">
          {/* Certificate Container (A4 Landscape aspect ratio: 842 x 595 pixels) */}
          <div
            id="certificate-print-area"
            className="w-[842px] h-[595px] bg-[#fcfbf9] text-[#1e293b] p-12 border-[16px] border-[#1e293b] relative flex flex-col justify-between select-none shadow-xl shrink-0"
            style={{
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              backgroundImage: 'radial-gradient(circle, rgba(212,175,55,0.05) 0%, transparent 80%)'
            }}
          >
            {/* Elegant Inner Gold Border */}
            <div className="absolute inset-2 border-2 border-[#d4af37] pointer-events-none" />

            {/* Corner Decorative Ornaments */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#d4af37]" />
            <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#d4af37]" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#d4af37]" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#d4af37]" />

            {/* Header Content */}
            <div className="text-center flex flex-col items-center mt-2">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span className="font-extrabold text-sm tracking-widest text-[#0f172a] font-display">SUMMARIX</span>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                Video & Podcast Summary Generator
              </p>
            </div>

            {/* Certificate Title */}
            <div className="text-center my-1">
              <h1 className="text-3xl font-extrabold tracking-wider text-[#0f172a] font-display uppercase">
                Certificate of Completion
              </h1>
              <div className="w-32 h-[2px] bg-[#d4af37] mx-auto mt-2 relative">
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#fcfbf9] border border-[#d4af37]" />
              </div>
            </div>

            {/* Recipient Statement */}
            <div className="text-center flex flex-col gap-1.5">
              <p className="text-xs italic text-gray-500 font-sans">This is proudly presented to</p>
              <h2 className="text-2xl font-black text-indigo-600 font-display border-b border-[#cbd5e1] pb-1 max-w-lg mx-auto leading-tight">
                {userName || userEmail || 'Valued Learner'}
              </h2>
            </div>

            {/* Completion Description */}
            <div className="text-center max-w-xl mx-auto">
              <p className="text-[11px] text-gray-600 leading-relaxed font-sans font-medium">
                for successfully completing the learning modules, analyzing video insights, and achieving passing scores on practice quizzes for the course:
              </p>
              <h3 className="text-base font-extrabold text-[#0f172a] font-sans mt-2 tracking-wide uppercase">
                {moduleName || 'LMS Workspace Module'}
              </h3>
            </div>

            {/* Seal Section */}
            <div className="flex justify-center items-center mt-2 relative">
              {/* Gold Emblem Seal */}
              <div className="flex flex-col items-center justify-center relative w-20 h-20 -mb-1">
                <svg className="absolute bottom-[-10px] w-12 h-14 text-red-700/80 drop-shadow-sm" viewBox="0 0 24 36" fill="currentColor">
                  <path d="M4 0h6v30l-3-3-3 3V0zm10 0h6v30l-3-3-3 3V0z" />
                </svg>
                <svg className="w-14 h-14 text-[#d4af37] fill-current relative drop-shadow" viewBox="0 0 36 36">
                  <path d="M18 0l2.5 3 3.5-.5.5 3.5 3 .5-1 3.5 2.5 2.5-2.5 2.5 1 3.5-3 .5-.5 3.5-3.5-.5L18 36l-2.5-3-3.5.5-.5-3.5-3-.5 1-3.5L6 24l2.5-2.5-1-3.5 3-.5.5-3.5 3.5.5L18 0z" />
                  <circle cx="18" cy="18" r="11" fill="#fcfbf9" />
                  <circle cx="18" cy="18" r="10" fill="none" stroke="#d4af37" strokeWidth="1" />
                </svg>
                <div className="absolute text-[6px] font-extrabold text-[#d4af37] font-mono text-center leading-none mt-[-2px]">
                  OFFICIAL<br />SEAL
                </div>
              </div>
            </div>

            {/* Verification Details Footer */}
            <div className="flex justify-center items-center text-[8px] font-mono text-gray-400 mt-4 px-2 border-t border-gray-100 pt-2 shrink-0">
              <div>Issued on {currentDate} | Total Videos: {totalLessons} | Total Quizzes: {totalQuizzes}</div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 font-semibold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md flex items-center gap-1.5"
          >
            <span>🖨️</span> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
