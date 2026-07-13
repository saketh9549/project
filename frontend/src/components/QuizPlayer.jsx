import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/api';
import { downloadCertificatePdf } from '../lib/certificatePdf';

export default function QuizPlayer({ quiz, onBackToVideo, onQuizComplete, nextVideoId, nextVideoTitle, isCourseQuiz, currentUser }) {
  const navigate = useNavigate();
  const questions = quiz.get?.('questions') || quiz.questions || [];
  const totalQuestions = questions.length;
  const [showCertificate, setShowCertificate] = useState(false);
  const certificateRef = useRef(null);
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState(() => Array(questions.length).fill(null));
  const [slideTrigger, setSlideTrigger] = useState(true);

  // Graded state
  const [gradedResult, setGradedResult] = useState(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // Score circular display transition trigger
  const [scoreAnimationVal, setScoreAnimationVal] = useState(0);

  useEffect(() => {
    // Trigger entrance animation on transition
    setSlideTrigger(true);
    const t = setTimeout(() => setSlideTrigger(false), 350);
    return () => clearTimeout(t);
  }, [currentIdx]);

  useEffect(() => {
    if (isFinished && gradedResult) {
      // Animate score circular progress bar
      const t = setTimeout(() => {
        setScoreAnimationVal(gradedResult.score || 0);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [isFinished, gradedResult]);

  const handleOptionSelect = (optIdx) => {
    const updated = [...answers];
    updated[currentIdx] = optIdx;
    setAnswers(updated);
  };

  const handleFinishQuiz = async () => {
    setGradingLoading(true);
    try {
      const formattedAnswers = answers
        .map((selectedOptionIdx, questionIdx) => ({
          questionIdx,
          selectedOptionIdx
        }))
        .filter(ans => ans.selectedOptionIdx !== null);

      const response = await fetch(apiUrl('/api/quizzes/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: quiz._id,
          answers: formattedAnswers
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to submit quiz');

      // Save score to local storage & dispatch change event
      const currentScores = JSON.parse(localStorage.getItem('summarix_quiz_scores') || '{}');
      const targetId = quiz.catalogId || quiz.catalog_id || quiz.playlistId || quiz.playlist_id;
      if (targetId) {
        currentScores[targetId] = Math.max(currentScores[targetId] || 0, data.score);
        localStorage.setItem('summarix_quiz_scores', JSON.stringify(currentScores));
      }
      
      // Also add to completed quizzes if passed with >= 75%
      if (data.score >= 75 && targetId) {
        const completed = JSON.parse(localStorage.getItem('summarix_completed_quizzes') || '[]');
        if (!completed.includes(targetId)) {
          completed.push(targetId);
          localStorage.setItem('summarix_completed_quizzes', JSON.stringify(completed));
          window.dispatchEvent(new Event('summarix_completed_change'));
        }
      }

      window.dispatchEvent(new Event('summarix_quiz_scores_change'));

      setGradedResult(data);
      setIsFinished(true);
      if (onQuizComplete) {
        onQuizComplete();
      }
    } catch (err) {
      alert('Grading failed: ' + err.message);
    } finally {
      setGradingLoading(false);
    }
  };

  const handleRetake = () => {
    setCurrentIdx(0);
    setAnswers(Array(questions.length).fill(null));
    setGradedResult(null);
    setIsFinished(false);
    setScoreAnimationVal(0);
    setShowReview(false);
  };

  const handleDownloadCertificate = async () => {
    setIsDownloadingCertificate(true);
    try {
      await downloadCertificatePdf(certificateRef.current, `${quiz.title || 'summarix'}-certificate`);
    } catch (error) {
      alert(error.message || 'Unable to download the certificate. Please try again.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  // Performance badges mapping
  const getPerformanceDetails = (score) => {
    if (score >= 90) return { title: 'Master', color: 'text-emerald-400', desc: 'Outstanding achievement! You have mastered this content.' };
    if (score >= 70) return { title: 'Practitioner', color: 'text-teal-400', desc: 'Great job! You have a solid grasp of the concepts.' };
    if (score >= 50) return { title: 'Apprentice', color: 'text-yellow-400', desc: 'Fair attempt! A bit more review will get you on top.' };
    return { title: 'Novice', color: 'text-red-400', desc: 'Needs work. Go back to the video chapters to review.' };
  };

  if (totalQuestions === 0) {
    return (
      <div className="flex-grow flex-1 flex flex-col items-center justify-center p-8 bg-gray-950/20 border border-white/5 rounded-2xl">
        <p className="text-gray-400 text-xs font-mono mb-4">No questions are configured in this quiz.</p>
        <button onClick={onBackToVideo} className="px-4 py-2 bg-indigo-600 text-white text-xs rounded-xl font-bold">
          Back to Video
        </button>
      </div>
    );
  }

  // Circular Score Dashboard
  if (isFinished && gradedResult) {
    const perf = getPerformanceDetails(gradedResult.score);
    const circumference = 283;
    const strokeDashoffset = circumference - (scoreAnimationVal / 100) * circumference;

    return (
      <>
        <div className="flex-grow flex-1 flex flex-col gap-6 p-6 glass-panel rounded-2xl border border-white/5 shadow-2xl min-h-0 overflow-y-auto max-w-2xl mx-auto w-full animate-quiz-slide">
        <div className="text-center border-b border-white/5 pb-5">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-mono">
            Practice Result
          </span>
          <h3 className="text-xl font-extrabold font-display text-white mt-1 truncate max-w-[400px] mx-auto">
            {quiz.title}
          </h3>
        </div>

        {gradedResult.score >= 75 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center animate-pulse">
            <span className="text-xl">🎉</span>
            <h4 className="text-emerald-400 font-extrabold text-sm mt-1">
              Assessment Passed! (75%+)
            </h4>
            <p className="text-[11px] text-gray-300 mt-1">
              Congratulations! You scored {gradedResult.score}% and successfully unlocked the next lecture module.
            </p>
          </div>
        ) : (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-center">
            <span className="text-xl">⚠️</span>
            <h4 className="text-rose-400 font-extrabold text-sm mt-1">
              Passing Score Required: 75%
            </h4>
            <p className="text-[11px] text-gray-300 mt-1">
              You scored {gradedResult.score}%. Retake the quiz and score at least 75% to unlock the next lecture module.
            </p>
          </div>
        )}

        {/* Circular Dashboard Scorecard */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4 bg-white/3 rounded-2xl border border-white/5 p-6">
          {/* Animated SVG Circle */}
          <div className="relative shrink-0 flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90 select-none" viewBox="0 0 100 100">
              <circle
                className="text-white/5"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
                r="45"
                cx="50"
                cy="50"
              />
              <circle
                className="text-cyan-400 progress-ring-circle"
                strokeWidth="8"
                strokeDasharray="283"
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="45"
                cx="50"
                cy="50"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-white font-mono">{gradedResult.score}%</span>
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Score</span>
            </div>
          </div>

          {/* Statistics summary */}
          <div className="text-center md:text-left min-w-0">
            <span className={`text-xs font-bold uppercase tracking-wider font-display ${perf.color}`}>
              {perf.title} Grade
            </span>
            <h4 className="text-base font-bold text-white mt-0.5 leading-snug">
              {gradedResult.correctCount} / {gradedResult.totalCount} Answers Correct
            </h4>
            <p className="text-gray-400 text-xs mt-2 max-w-sm leading-relaxed">
              {perf.desc}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={handleRetake}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Retake Quiz
          </button>
          <button
            onClick={onBackToVideo}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Back to Video Workspace
          </button>
          {isCourseQuiz && gradedResult.score >= 75 && (
            <button
              onClick={() => setShowCertificate(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center gap-1.5 animate-pulse"
            >
              <span>🎓</span> Claim Certificate
            </button>
          )}
          {nextVideoId && (
            <button
              onClick={() => navigate(`/video/${nextVideoId}`)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center gap-1.5"
              title={`Next Lesson: ${nextVideoTitle}`}
            >
              <span>Next Lesson</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Detailed Solutions Review Collapsible Accordion */}
        <div className="mt-4 border-t border-white/5 pt-5 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowReview(!showReview)}
            className="flex items-center justify-between w-full text-left cursor-pointer group select-none hover:text-white transition-colors focus:outline-none"
          >
            <h4 className="text-xs font-bold text-gray-400 group-hover:text-white uppercase tracking-wider font-display flex items-center gap-2">
              <span>Questions Review</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/10 px-2.5 py-0.5 rounded-full">
                {gradedResult.results.length} Items
              </span>
            </h4>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${showReview ? 'rotate-180 text-white' : ''
                }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showReview && (
            <div className="flex flex-col gap-3 animate-fade-in">
              {gradedResult.results.map((res, idx) => {
                return (
                  <div key={idx} className="bg-white/3 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-xs text-white">
                        {idx + 1}. {res.questionText}
                      </span>
                      {res.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                          ✓ Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 font-mono bg-red-500/10 border border-red-500/10 px-2 py-0.5 rounded-full shrink-0">
                          ✗ Incorrect
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                      {res.options.map((opt, oIdx) => {
                        let btnBorder = 'border-white/5 bg-black/10 text-gray-400';
                        if (oIdx === res.correctAnswerIdx) {
                          btnBorder = 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 font-semibold';
                        } else if (oIdx === res.selectedOptionIdx && !res.isCorrect) {
                          btnBorder = 'border-red-500/30 bg-red-500/5 text-red-400';
                        }
                        return (
                          <div key={oIdx} className={`px-3 py-1.5 rounded-lg text-xs truncate border ${btnBorder}`}>
                            <span className="font-mono text-[10px] mr-1.5">{String.fromCharCode(65 + oIdx)}.</span>
                            {opt}
                          </div>
                        );
                      })}
                    </div>

                    {res.explanation && (
                      <div className="bg-indigo-950/10 border border-indigo-500/10 p-3 rounded-lg text-[11px] text-indigo-300 mt-1 flex items-start gap-2">
                        <span className="shrink-0 text-xs">💡</span>
                        <span className="leading-relaxed"><strong>Explanation:</strong> {res.explanation}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
          <style>{`
            @media print {
              @page {
                size: landscape;
                margin: 0;
              }
              body {
                margin: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .cert-modal-overlay {
                position: absolute !important;
                inset: 0 !important;
                background: white !important;
                padding: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              }
              .cert-card-container {
                border: none !important;
                box-shadow: none !important;
                width: 100vw !important;
                height: 100vh !important;
                max-width: none !important;
                border-radius: 0 !important;
              }
            }
          `}</style>

          <div className="cert-modal-overlay relative flex items-center justify-center w-full max-w-[760px] animate-quiz-slide">
            {/* Close Button */}
            <button
              onClick={() => setShowCertificate(false)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white font-sans print:hidden bg-white/10 hover:bg-white/20 rounded-full transition-all cursor-pointer flex items-center justify-center z-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* The Certificate card */}
            <div ref={certificateRef} className="cert-card-container relative w-full aspect-[1.414/1] bg-white text-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-200/50 flex flex-row print:fixed print:inset-0 print:w-screen print:h-screen print:rounded-none print:border-none print:shadow-none">
              
              {/* Left Panel Curved Navy & Gold Frame */}
              <div className="absolute top-0 left-0 h-full w-[260px] z-0 overflow-hidden pointer-events-none print:w-[32.5%]">
                <svg className="w-full h-full" viewBox="0 0 260 600" preserveAspectRatio="none">
                  {/* Dark navy sweep */}
                  <path d="M 0 0 L 150 0 Q 210 300 240 600 L 0 600 Z" fill="#0c2340" />
                  {/* Gold sweep line */}
                  <path d="M 150 0 Q 210 300 240 600 L 250 600 Q 220 300 160 0 Z" fill="#dca842" />
                </svg>
                
                {/* Gold Rosette Seal Overlay in top-left */}
                <div className="absolute top-10 left-10 z-10">
                  <svg className="w-24 h-24 drop-shadow-xl" viewBox="0 0 100 100">
                    {/* Ribbon tails */}
                    <path d="M 35 60 L 20 95 L 38 85 L 48 70 Z" fill="#e5ad35" />
                    <path d="M 65 60 L 80 95 L 62 85 L 52 70 Z" fill="#e5ad35" />
                    <path d="M 35 60 L 28 80 L 38 75 Z" fill="#b9881e" />
                    <path d="M 65 60 L 72 80 L 62 75 Z" fill="#b9881e" />
                    
                    {/* Scalloped pleated gold rosette points */}
                    <g fill="#f1b319" stroke="#cfa018" strokeWidth="0.5">
                      {[...Array(24)].map((_, i) => (
                        <path 
                          key={i} 
                          d="M 50 12 L 53 18 L 47 18 Z" 
                          transform={`rotate(${i * 15} 50 50)`} 
                        />
                      ))}
                    </g>
                    {/* Inner gold rings */}
                    <circle cx="50" cy="50" r="28" fill="#fcca29" stroke="#b9881e" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="23" fill="#ffe066" />
                    {/* White highlight reflection */}
                    <path d="M 33 39 A 20 20 0 0 1 67 39 A 20 20 0 0 0 33 39 Z" fill="#ffffff" opacity="0.45" />
                  </svg>
                </div>
              </div>

              {/* Gold Inner Frame Border */}
              <div className="absolute inset-5 border-[3px] border-[#dca842] rounded-md pointer-events-none z-10" />

              {/* Abstract Wavy Lines in White Background */}
              <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none z-0" viewBox="0 0 800 600" preserveAspectRatio="none">
                <path d="M 300 0 C 400 200 700 300 800 150 M 350 0 C 450 250 750 350 800 200 M 400 0 C 500 300 800 400 800 250" fill="none" stroke="#000000" strokeWidth="3" />
                <path d="M 200 600 C 300 400 600 300 800 450 M 250 600 C 350 450 650 350 800 500 M 300 600 C 400 500 700 400 800 550" fill="none" stroke="#000000" strokeWidth="3" />
              </svg>

              {/* Main Content Area */}
              <div className="relative flex-1 h-full z-20 pl-[290px] pr-14 py-16 flex flex-col justify-between items-center text-center font-serif">
                
                {/* Title header */}
                <div className="flex flex-col items-center mt-2">
                  <h1 className="text-[44px] font-bold text-[#0c2340] leading-none mb-1 tracking-tight">
                    Certificate
                  </h1>
                  <h2 className="font-sans text-[10px] uppercase tracking-[0.28em] text-slate-500 font-bold">
                    of Recognition
                  </h2>
                </div>

                {/* Presentation Subtext */}
                <div className="flex flex-col items-center w-full">
                  <p className="font-sans text-[11px] text-slate-400 italic mb-5 tracking-wide">
                    This certificate is presented to
                  </p>
                  
                  {/* Dynamic Student/User Name */}
                  <h3 className="text-[36px] font-semibold text-[#c89228] tracking-wide capitalize leading-tight mb-5 font-serif select-all">
                    {currentUser?.username || currentUser?.name || currentUser?.email || 'Successful Graduate'}
                  </h3>
                  
                  {/* Dynamic Course Name Description */}
                  <p className="font-sans text-[12px] text-[#334155] leading-relaxed max-w-[440px] mb-6">
                    in recognition of their successful completion of the <span className="font-semibold text-slate-900">{(quiz.title || 'Vite Course Playlist').replace(/(?:\s+practice)?\s+quiz/gi, '').replace(/\s+final\s+course\s+assessment/gi, '').trim()}</span> certification program on <span className="font-semibold text-slate-900">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>.
                  </p>
                </div>

                {/* Divider Line & Disclaimer */}
                <div className="flex flex-col items-center w-full mb-2">
                  <div className="w-[180px] h-[1px] bg-slate-200 mb-5" />
                  <p className="font-sans text-[8.5px] text-slate-400 leading-normal max-w-[460px] text-justify md:text-center px-4">
                    This certificate attests to the learner's completion of an online course. It does not constitute formal enrollment at any university or entity and does not itself grant academic credit, grades, or a degree. Institutions or organizations may, at their discretion, recognize this learning toward their own programs or credentials.
                  </p>
                </div>

              </div>

            </div>

            {/* Print and Back Actions Row */}
            <div className="absolute -bottom-16 left-0 right-0 flex justify-center gap-3 print:hidden z-50">
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-sans font-bold text-xs rounded-xl shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Back to Home</span>
              </button>
              <button
                onClick={handleDownloadCertificate}
                disabled={isDownloadingCertificate}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-sans font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>{isDownloadingCertificate ? 'Preparing PDF…' : 'Download PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // Active Quiz Playing View
  const activeQuestion = questions[currentIdx];
  const progressPercent = ((currentIdx + 1) / totalQuestions) * 100;

  return (
    <div className="flex-grow flex-1 flex flex-col gap-6 p-6 glass-panel rounded-2xl border border-white/5 shadow-2xl min-h-0 overflow-y-auto max-w-xl mx-auto w-full animate-quiz-slide">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
        <div className="min-w-0">
          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest font-mono">
            Question Assessment
          </span>
          <h3 className="text-base font-bold font-display text-white truncate max-w-[280px] mt-0.5" title={quiz.title}>
            {quiz.title}
          </h3>
        </div>
        <button
          onClick={onBackToVideo}
          className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer shrink-0 font-medium"
        >
          Cancel
        </button>
      </div>

      {/* Progress slider bar */}
      <div className="shrink-0 flex flex-col gap-1.5 select-none">
        <div className="flex justify-between text-[10px] font-mono text-gray-400">
          <span>Progress</span>
          <span className="font-bold text-gray-300">{currentIdx + 1} of {totalQuestions}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden border border-white/5">
          <div
            className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.3)] transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Active Question sliding frame */}
      <div className={`flex-grow flex flex-col justify-center gap-5 ${slideTrigger ? 'opacity-0 scale-[0.99]' : 'animate-quiz-slide opacity-100 scale-100'}`}>
        <h4 className="text-sm font-bold text-white leading-relaxed font-display text-center py-2 min-h-[48px]">
          {activeQuestion.questionText}
        </h4>

        {/* Option Selection Grid */}
        <div className="flex flex-col gap-3">
          {activeQuestion.options.map((opt, oIdx) => {
            const isSelected = answers[currentIdx] === oIdx;
            const optionClass = isSelected
              ? 'border-indigo-500 bg-indigo-950/20 text-white font-semibold shadow-[0_0_10px_rgba(99,102,241,0.05)]'
              : 'border-white/5 bg-gray-900/40 text-gray-300';

            return (
              <button
                key={oIdx}
                type="button"
                onClick={() => handleOptionSelect(oIdx)}
                className={`w-full flex items-center justify-between text-left p-4 rounded-xl border quiz-option-btn cursor-pointer ${optionClass}`}
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs border shrink-0 transition-all ${isSelected
                    ? 'border-indigo-500/20 bg-indigo-500/10 text-white'
                    : 'border-white/10 bg-black/20 text-gray-500'
                    }`}>
                    {String.fromCharCode(65 + oIdx)}
                  </span>
                  <span className="text-xs truncate">{opt}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Explanation display block is hidden during active quiz, shown only in Questions Review */}
      </div>

      {/* Footer Navigation Controls */}
      <div className="shrink-0 flex items-center justify-between mt-auto border-t border-white/5 pt-4">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider font-mono">
          Assessment Active
        </span>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentIdx(currentIdx - 1)}
            disabled={currentIdx === 0}
            className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 ${currentIdx > 0
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md active:scale-[0.98]'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'
              }`}
          >
            Preview
          </button>

          <button
            type="button"
            onClick={() => {
              if (currentIdx + 1 < totalQuestions) {
                setCurrentIdx(currentIdx + 1);
              } else {
                handleFinishQuiz();
              }
            }}
            disabled={answers[currentIdx] === null || gradingLoading}
            className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 ${answers[currentIdx] !== null
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md active:scale-[0.98]'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'
              }`}
          >
            {gradingLoading && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{currentIdx + 1 === totalQuestions ? 'Finish Quiz' : 'Next Question'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
