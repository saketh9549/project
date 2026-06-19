import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export default function QuizPlayer({ quiz, videoTitle, onBackToVideo, onQuizComplete }) {
  const questions = quiz.get?.('questions') || quiz.questions || [];
  const totalQuestions = questions.length;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]); // Array of { questionIdx, selectedOptionIdx }
  const [slideTrigger, setSlideTrigger] = useState(true);

  // Graded state
  const [gradedResult, setGradedResult] = useState(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

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
    if (submitted) return;
    setSelectedIdx(optIdx);
  };

  const handleSubmitAnswer = () => {
    if (selectedIdx === null || submitted) return;
    setSubmitted(true);

    // Save answer
    const newAnswer = {
      questionIdx: currentIdx,
      selectedOptionIdx: selectedIdx
    };
    setAnswers([...answers, newAnswer]);
  };

  const handleNext = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx(currentIdx + 1);
      setSelectedIdx(null);
      setSubmitted(false);
    } else {
      // Submit full quiz
      handleFinishQuiz();
    }
  };

  const handleFinishQuiz = async () => {
    setGradingLoading(true);
    try {
      const response = await fetch(apiUrl('/api/quizzes/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: quiz._id,
          answers: answers
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to submit quiz');

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
    setSelectedIdx(null);
    setSubmitted(false);
    setAnswers([]);
    setGradedResult(null);
    setIsFinished(false);
    setScoreAnimationVal(0);
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
      <div className="flex-grow flex-1 flex flex-col gap-6 p-6 glass-panel rounded-2xl border border-white/5 shadow-2xl min-h-0 overflow-y-auto max-w-2xl mx-auto w-full animate-quiz-slide">
        <div className="text-center border-b border-white/5 pb-5">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-mono">
            Practice Result
          </span>
          <h3 className="text-xl font-extrabold font-display text-white mt-1 truncate max-w-[400px] mx-auto">
            {quiz.title}
          </h3>
        </div>

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
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleRetake}
            className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white font-semibold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
          >
            Retake Quiz
          </button>
          <button
            onClick={onBackToVideo}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Back to Video Workspace
          </button>
        </div>

        {/* Detailed Solutions Review */}
        <div className="flex flex-col gap-4 mt-4 border-t border-white/5 pt-5">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display">
            Questions Review
          </h4>
          <div className="flex flex-col gap-3">
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
        </div>
      </div>
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
            const isSelected = selectedIdx === oIdx;
            const isCorrect = oIdx === activeQuestion.correctAnswerIdx;
            const isIncorrectSelection = isSelected && !isCorrect;

            let optionClass = 'border-white/5 bg-gray-900/40 text-gray-300';
            let statusIcon = null;

            if (submitted) {
              if (isCorrect) {
                optionClass = 'border-emerald-500 bg-emerald-950/20 text-emerald-400 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.06)]';
                statusIcon = (
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                );
              } else if (isIncorrectSelection) {
                optionClass = 'border-red-500 bg-red-950/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.06)]';
                statusIcon = (
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                );
              } else {
                optionClass = 'border-white/5 bg-gray-950/30 text-gray-600 opacity-60';
              }
            } else if (isSelected) {
              optionClass = 'border-indigo-500 bg-indigo-950/20 text-white font-semibold shadow-[0_0_10px_rgba(99,102,241,0.05)]';
            }

            return (
              <button
                key={oIdx}
                type="button"
                onClick={() => handleOptionSelect(oIdx)}
                disabled={submitted}
                className={`w-full flex items-center justify-between text-left p-4 rounded-xl border quiz-option-btn cursor-pointer ${optionClass}`}
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs border shrink-0 transition-all ${
                    submitted && isCorrect
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : submitted && isIncorrectSelection
                      ? 'border-red-500/20 bg-red-500/10 text-red-400'
                      : isSelected
                      ? 'border-indigo-500/20 bg-indigo-500/10 text-white'
                      : 'border-white/10 bg-black/20 text-gray-500'
                  }`}>
                    {String.fromCharCode(65 + oIdx)}
                  </span>
                  <span className="text-xs truncate">{opt}</span>
                </div>
                {statusIcon}
              </button>
            );
          })}
        </div>

        {/* Contextual Gemini Explanation Display */}
        {submitted && activeQuestion.explanation && (
          <div className="bg-indigo-950/10 border border-indigo-500/10 p-4 rounded-xl text-xs text-indigo-300 mt-2 flex items-start gap-2.5 animate-fade-in select-text leading-relaxed">
            <span className="shrink-0 text-sm mt-0.5">💡</span>
            <div className="flex-1">
              <h5 className="font-bold text-[10px] uppercase tracking-wider mb-0.5">Explanation</h5>
              <p>{activeQuestion.explanation}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Submission Controls */}
      <div className="shrink-0 flex items-center justify-between mt-auto border-t border-white/5 pt-4">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider font-mono">
          Assessment Active
        </span>

        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmitAnswer}
            disabled={selectedIdx === null}
            className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-all cursor-pointer ${
              selectedIdx !== null
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md active:scale-[0.98]'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'
            }`}
          >
            Submit Answer
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={gradingLoading}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center gap-2"
          >
            {gradingLoading && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{currentIdx + 1 === totalQuestions ? 'Finish Quiz' : 'Next Question'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
