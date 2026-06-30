import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export default function QuizAnalytics({ currentUser, showSuccess, showError }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    attempts: [],
    courses: [],
    stats: { totalAttempts: 0, averageScore: 0, passRate: 0 }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all'); // all, pass, fail
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedQuizzes, setExpandedQuizzes] = useState({});
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const toggleCourse = (courseId) => {
    setExpandedCourses(prev => {
      const isCurrentlyExpanded = !!prev[courseId];
      if (!isCurrentlyExpanded) {
        setSelectedCourseId(courseId);
        return { [courseId]: true };
      } else {
        setSelectedCourseId(null);
        return {};
      }
    });
  };

  const toggleQuiz = (quizId) => {
    setExpandedQuizzes(prev => ({
      ...prev,
      [quizId]: !prev[quizId]
    }));
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const response = await fetch(apiUrl(`/api/quizzes/analytics?owner_email=${encodeURIComponent(email)}&role=${role}`));
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to fetch analytics');
      }
      const resData = await response.json();
      setData(resData);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentUser]);

  useEffect(() => {
    if (data.courses && data.courses.length > 0) {
      // Auto-expand the first course by default
      const firstCourseId = data.courses[0].id;
      setExpandedCourses({ [firstCourseId]: true });
      setSelectedCourseId(firstCourseId);
    }
  }, [data.courses]);

  // Lock parent page scrolling when inspect modal is open to keep page layout constant
  useEffect(() => {
    const parentContainer = document.querySelector('.overflow-y-auto');
    if (selectedAttempt) {
      document.body.style.overflow = 'hidden';
      if (parentContainer) {
        parentContainer.style.overflowY = 'hidden';
      }
    } else {
      document.body.style.overflow = '';
      if (parentContainer) {
        parentContainer.style.overflowY = '';
      }
    }
    return () => {
      document.body.style.overflow = '';
      if (parentContainer) {
        parentContainer.style.overflowY = '';
      }
    };
  }, [selectedAttempt]);

  const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Filter attempts and calculate stats dynamically on basis of folder/course selection
  const selectedCourseQuizzes = selectedCourseId
    ? (data.courses.find(c => c.id === selectedCourseId)?.quizzes || [])
    : [];

  const selectedCourseAttempts = selectedCourseId
    ? data.attempts.filter(a => a.playlistId === selectedCourseId)
    : data.attempts;

  const totalAttempts = selectedCourseAttempts.length;
  
  const averageScore = selectedCourseAttempts.length > 0
    ? roundToTwo(selectedCourseAttempts.reduce((acc, val) => acc + val.score, 0) / selectedCourseAttempts.length)
    : 0.0;

  const passingAttempts = selectedCourseAttempts.filter(a => a.score >= 75.0).length;
  const passRate = selectedCourseAttempts.length > 0
    ? roundToTwo((passingAttempts / selectedCourseAttempts.length) * 100)
    : 0.0;

  const uniqueQuizzesCount = selectedCourseId
    ? selectedCourseQuizzes.length
    : (data.courses ? data.courses.reduce((acc, course) => acc + course.quizzes.length, 0) : 0);

  // Filter attempts based on search and score dropdown
  const filteredAttempts = selectedCourseAttempts.filter((attempt) => {
    const matchesSearch =
      attempt.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (attempt.username && attempt.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      attempt.quizTitle.toLowerCase().includes(searchTerm.toLowerCase());

    if (scoreFilter === 'pass') {
      return matchesSearch && attempt.score >= 75.0;
    } else if (scoreFilter === 'fail') {
      return matchesSearch && attempt.score < 75.0;
    }
    return matchesSearch;
  });

  const getScoreBadgeClass = (score) => {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (score >= 75) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
    return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  };

  const getScoreBadgeText = (score) => {
    if (score >= 80) return 'High Pass';
    if (score >= 75) return 'Pass';
    return 'Fail';
  };

  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full p-4 flex flex-col gap-8">
      <div className="animate-quiz-slide flex flex-col gap-8 flex-grow">
        {/* Header Banner */}
      <div className="glass-panel p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden bg-gradient-to-br from-indigo-950/20 via-slate-900/10 to-cyan-950/10 shrink-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl -z-10" />

        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
            System Admin
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
            Live Feed
          </span>
        </div>
        <h2 className="text-2xl font-extrabold font-display text-white mb-2 tracking-tight">
          Quiz Performance Analytics
        </h2>
        <p className="text-gray-400 text-xs max-w-lg leading-relaxed">
          Monitor student quiz completions in real-time, view score statistics, and inspect detailed, question-level response logs.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-xs text-gray-500 font-mono">Loading analytics data...</span>
        </div>
      ) : (
        <>
          {/* Selected Folder Filter Banner */}
          {selectedCourseId && (
            <div className="flex items-center justify-between px-5 py-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.01] text-xs text-indigo-700 dark:text-indigo-300 font-semibold shadow-[0_4px_12px_rgba(99,102,241,0.02)] shrink-0 animate-fade-in">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Showing analytics for folder: <strong className="text-slate-800 dark:text-slate-200 capitalize">{data.courses.find(c => c.id === selectedCourseId)?.name || 'Selected Folder'}</strong></span>
              </div>
              <button
                onClick={() => {
                  setSelectedCourseId(null);
                  setExpandedCourses({});
                }}
                className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 rounded-lg transition-all border border-indigo-500/20 cursor-pointer"
              >
                Clear Filter
              </button>
            </div>
          )}

          {/* Stats Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Total Attempts */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-row justify-between items-center relative overflow-hidden transition-all duration-300">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Total Attempts</span>
                <span className="text-3xl font-extrabold font-display text-white">{totalAttempts}</span>
                <span className="text-[10px] text-gray-400">submissions</span>
              </div>
              <div className="w-11 h-11 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>

            {/* Average Score */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-row justify-between items-center relative overflow-hidden transition-all duration-300">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Average Score</span>
                <span className="text-3xl font-extrabold font-display bg-gradient-to-r from-cyan-500 to-indigo-500 dark:from-cyan-400 dark:to-indigo-300 bg-clip-text text-transparent">{averageScore}%</span>
                <span className="text-[10px] text-gray-400">graded average</span>
              </div>
              <div className="w-11 h-11 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500 dark:text-cyan-400 shrink-0">
                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              </div>
            </div>

            {/* Pass Rate */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-row justify-between items-center relative overflow-hidden transition-all duration-300">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Pass Rate</span>
                <span className="text-3xl font-extrabold font-display text-white">{passRate}%</span>
                <span className="text-[10px] text-emerald-500 font-bold">&gt;= 75% score</span>
              </div>
              <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
            </div>

            {/* Unique Quizzes */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-row justify-between items-center relative overflow-hidden transition-all duration-300">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Unique Quizzes</span>
                <span className="text-3xl font-extrabold font-display text-white">{uniqueQuizzesCount}</span>
                <span className="text-[10px] text-gray-400">attempted</span>
              </div>
              <div className="w-11 h-11 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4 1.253" />
                </svg>
              </div>
            </div>
          </div>

          {/* Course-Grouped Quiz Performance Section */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2 tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Course Curriculum Performance
            </h3>
            
            {(!data.courses || data.courses.length === 0) ? (
              <div className="text-center text-xs text-gray-500 font-mono py-8 border border-black/5 dark:border-white/5 rounded-2xl bg-black/[0.01] dark:bg-slate-950/20">
                No course performance metrics available.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {data.courses.map((course) => {
                  const isExpanded = !!expandedCourses[course.id];
                  const totalQuizzes = course.quizzes.length;
                  const totalAttemptsInCourse = course.quizzes.reduce((acc, q) => acc + q.attemptsCount, 0);
                  
                  const isSelected = selectedCourseId === course.id;
                  
                  return (
                    <div key={course.id} className={`glass-panel rounded-2xl overflow-hidden shadow-md transition-all duration-300 ${isSelected ? 'border-indigo-500/40 dark:border-indigo-500/40 bg-indigo-500/[0.02] shadow-[0_8px_24px_rgba(99,102,241,0.06)]' : 'border-black/5 dark:border-white/5'}`}>
                      {/* Course Header Bar */}
                      <button
                        onClick={() => toggleCourse(course.id)}
                        className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4 1.253" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-sm text-slate-800 dark:text-white capitalize">
                                {course.name}
                              </h4>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                              <span>{totalQuizzes} {totalQuizzes === 1 ? 'Quiz' : 'Quizzes'}</span>
                              <span>•</span>
                              <span>{totalAttemptsInCourse} {totalAttemptsInCourse === 1 ? 'Attempt' : 'Attempts'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <svg
                          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {/* Expanded Course content */}
                      {isExpanded && (
                        <div className="px-5 pb-5 border-t border-black/5 dark:border-white/5 flex flex-col gap-3 bg-black/[0.005] dark:bg-slate-950/10 pt-4 animate-fade-in">
                          {course.quizzes.map((quiz) => {
                            const isQuizExpanded = !!expandedQuizzes[quiz.quizId];
                            return (
                              <div key={quiz.quizId} className="border border-black/5 dark:border-white/5 rounded-xl overflow-hidden bg-white/50 dark:bg-slate-900/30">
                                {/* Quiz Accordion Header */}
                                <button
                                  onClick={() => toggleQuiz(quiz.quizId)}
                                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-all"
                                >
                                  <div>
                                    <h5 className="font-bold text-xs text-slate-800 dark:text-white">
                                      {quiz.quizTitle}
                                    </h5>
                                    <div className="flex gap-3 text-[9px] text-gray-500 uppercase font-mono mt-1">
                                      <span>Attempts: <strong>{quiz.attemptsCount}</strong></span>
                                      <span>Avg Score: <strong className="text-cyan-600 dark:text-cyan-400">{quiz.averageScore}%</strong></span>
                                    </div>
                                  </div>
                                  <svg
                                    className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isQuizExpanded ? 'rotate-180' : ''}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                
                                {/* Expanded Quiz Attempts Table */}
                                {isQuizExpanded && (
                                  <div className="border-t border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-slate-950/20 px-4 py-3 animate-fade-in">
                                    {quiz.attempts.length === 0 ? (
                                      <div className="text-center text-[10px] text-gray-500 font-mono py-4">
                                        No submissions recorded for this quiz yet.
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left border-collapse">
                                          <thead>
                                            <tr className="border-b border-black/5 dark:border-white/5 text-[9px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-mono">
                                              <th className="py-2 px-3">Student</th>
                                              <th className="py-2 px-3 text-center">Score</th>
                                              <th className="py-2 px-3 text-center">Outcome</th>
                                              <th className="py-2 px-3">Date</th>
                                              <th className="py-2 px-3 text-right">Action</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-black/5 dark:divide-white/5 text-[11px]">
                                            {quiz.attempts.map((att) => (
                                              <tr key={att.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                                <td className="py-2.5 px-3">
                                                  <div className="font-semibold text-slate-800 dark:text-white">{att.username}</div>
                                                  <div className="text-[9px] text-gray-500 dark:text-gray-400 font-mono">{att.userEmail}</div>
                                                </td>
                                                <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-white">
                                                  {att.score}%
                                                  <span className="block text-[8px] text-gray-500 dark:text-gray-400 font-normal">
                                                    {att.correctCount}/{att.totalCount} correct
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${getScoreBadgeClass(att.score)}`}>
                                                    {getScoreBadgeText(att.score)}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
                                                  {formatDate(att.submittedAt)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                  <button
                                                    onClick={() => setSelectedAttempt(att)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/40 border border-indigo-500/20 hover:border-indigo-500/40 cursor-pointer transition-all"
                                                  >
                                                    Inspect
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attempts Log list with Search/Filter */}
          <div className="glass-panel rounded-2xl overflow-hidden flex flex-col shadow-lg">
            {/* Toolbar */}
            <div className="p-4 border-b border-black/5 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/[0.02] dark:bg-slate-950/40">
              <div className="flex items-center gap-2 self-start sm:self-center">
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">Attempt Logs</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                  {filteredAttempts.length} of {data.attempts.length}
                </span>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {/* Search */}
                <div className="relative flex-grow sm:flex-grow-0">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search user email or quiz title..."
                    className="w-full sm:w-64 bg-white/50 dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 font-sans transition-all"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Filter */}
                <select
                  value={scoreFilter}
                  onChange={(e) => setScoreFilter(e.target.value)}
                  className="bg-white/50 dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500/50 font-sans cursor-pointer transition-all"
                >
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">All Scores</option>
                  <option value="pass" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">Passed (&gt;=50%)</option>
                  <option value="fail" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">Failed (&lt;50%)</option>
                </select>

                {/* Refresh */}
                <button
                  onClick={fetchAnalytics}
                  className="p-1.5 border border-black/10 dark:border-white/10 rounded-xl bg-white/50 dark:bg-slate-900 text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                  title="Reload feed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto w-full">
              {filteredAttempts.length === 0 ? (
                <div className="text-center text-xs text-gray-500 font-mono py-16">
                  {searchTerm || scoreFilter !== 'all' ? 'No attempts match your filters.' : 'No user has attempted any quiz yet.'}
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-slate-950/20 text-[9px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-mono">
                      <th className="py-3.5 px-5">User</th>
                      <th className="py-3.5 px-5">Quiz Title</th>
                      <th className="py-3.5 px-5 text-center">Score</th>
                      <th className="py-3.5 px-5 text-center">Outcome</th>
                      <th className="py-3.5 px-5">Submitted At</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 text-xs">
                    {filteredAttempts.map((attempt) => (
                      <tr
                        key={attempt.id}
                        className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-4 px-5">
                          <div className="font-semibold text-slate-800 dark:text-white">{attempt.username}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{attempt.userEmail}</div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-medium text-slate-800 dark:text-white max-w-xs truncate" title={attempt.quizTitle}>
                            {attempt.quizTitle}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-center font-mono font-bold text-slate-800 dark:text-white">
                          {attempt.score}%
                          <span className="block text-[9px] text-gray-500 dark:text-gray-400 font-normal">
                            {attempt.correctCount}/{attempt.totalCount} correct
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${getScoreBadgeClass(attempt.score)}`}>
                            {getScoreBadgeText(attempt.score)}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                          {formatDate(attempt.submittedAt)}
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => setSelectedAttempt(attempt)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/40 border border-indigo-500/20 hover:border-indigo-500/40 cursor-pointer select-none transition-all"
                          >
                            Inspect
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
      </div>

      {/* Drill-down Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl border border-slate-200/50 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.18)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] backdrop-blur-xl flex flex-col overflow-hidden relative animate-quiz-slide">
            
            {/* Top gradient glowing bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-500 z-10" />

            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200/40 dark:border-white/5 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/40 pt-7">
              <div className="min-w-0 flex-grow">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 dark:bg-white/5 text-[9px] font-extrabold text-indigo-600 dark:text-gray-400 uppercase tracking-widest font-mono mb-2">
                  Attempt Breakdown
                </span>
                <h3 className="text-base font-extrabold bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-slate-200 bg-clip-text text-transparent truncate max-w-[90%]" title={selectedAttempt.quizTitle}>
                  {selectedAttempt.quizTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                  <span>Student: <strong className="text-slate-800 dark:text-slate-200">{selectedAttempt.username}</strong> ({selectedAttempt.userEmail})</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>Date: <span className="font-mono font-semibold">{formatDate(selectedAttempt.submittedAt)}</span></span>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedAttempt(null)}
                className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 hover:scale-105 transition-all cursor-pointer shadow-sm border border-slate-200/30 dark:border-white/5"
                title="Close"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Stats Bar */}
            <div className="px-6 py-4 bg-slate-50/20 dark:bg-slate-950/20 border-b border-slate-200/40 dark:border-white/5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Submissions Score:</span>
                <span className="text-base font-extrabold bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent px-3 py-1 bg-indigo-50/50 dark:bg-white/5 rounded-xl border border-indigo-100/50 dark:border-white/5 shadow-sm">
                  {selectedAttempt.score}%
                </span>
                <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getScoreBadgeClass(selectedAttempt.score)}`}>
                  {getScoreBadgeText(selectedAttempt.score)}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-gray-400 bg-slate-100/50 dark:bg-white/5 px-3 py-1 rounded-xl border border-slate-200/30 dark:border-white/5">
                <span className="text-indigo-600 dark:text-cyan-400 font-extrabold">{selectedAttempt.correctCount}</span>
                <span className="text-slate-400 dark:text-gray-500 font-normal"> / {selectedAttempt.totalCount} Correct</span>
              </div>
            </div>

            {/* Modal Content - Scrollable list of questions */}
            <div className="p-6 overflow-y-auto flex flex-col gap-6 flex-grow bg-white/20 dark:bg-slate-900/10">
              {selectedAttempt.results.map((res, qIdx) => {
                const hasSelected = res.selectedOptionIdx !== -1;
                const isCorrect = res.isCorrect;
                return (
                  <div
                    key={qIdx}
                    className={`p-5 rounded-2xl border transition-all duration-300 hover:translate-y-[-1px] ${isCorrect
                      ? 'border-emerald-500/20 bg-emerald-500/[0.015] dark:bg-emerald-500/[0.01] shadow-[0_4px_12px_rgba(16,185,129,0.02)]'
                      : 'border-rose-500/20 bg-rose-500/[0.015] dark:bg-rose-500/[0.01] shadow-[0_4px_12px_rgba(244,63,94,0.02)]'
                      } flex flex-col gap-4`}
                  >
                    {/* Question text & correct marker */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold bg-indigo-500/10 dark:bg-white/10 text-indigo-600 dark:text-indigo-400 rounded-md shrink-0 mt-0.5">
                          Q{qIdx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed">{res.questionText}</h4>
                      </div>
                      <div className="shrink-0">
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <svg className="w-3 h-3 stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-rose-600 dark:text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                            <svg className="w-3 h-3 stroke-[2.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Incorrect
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Options list */}
                    <div className="flex flex-col gap-2.5 pl-6">
                      {res.options.map((option, optIdx) => {
                        const isStudentChoice = res.selectedOptionIdx === optIdx;
                        const isCorrectChoice = res.correctAnswerIdx === optIdx;

                        let optionStyle = 'border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] text-slate-600 dark:text-gray-300 hover:bg-slate-100/50 dark:hover:bg-white/[0.03]';
                        if (isCorrectChoice) {
                          optionStyle = 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-300 font-semibold shadow-[0_2px_8px_rgba(16,185,129,0.04)]';
                        } else if (isStudentChoice && !isCorrect) {
                          optionStyle = 'border-rose-500/30 bg-rose-500/[0.06] text-rose-800 dark:text-rose-300 font-semibold';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center justify-between border rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200 ${optionStyle}`}
                          >
                            <span>{option}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isStudentChoice && (
                                <span className={`text-[8px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 mr-1.5`}>
                                  Your Choice
                                </span>
                              )}
                              {isCorrectChoice && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                  <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                              {isStudentChoice && !isCorrect && (
                                <div className="w-5 h-5 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                                  <svg className="w-3 h-3 text-rose-600 dark:text-rose-400 stroke-[2.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {res.explanation && (
                      <div className="mt-1 pl-6">
                        <div className="flex items-center gap-1.5 text-[9px] text-indigo-500 dark:text-indigo-400 font-extrabold uppercase tracking-wider mb-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Explanation
                        </div>
                        <div className="border-l-4 border-indigo-500 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-r-xl">
                          <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed italic">{res.explanation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-200/40 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/40 text-center flex justify-end">
              <button
                onClick={() => setSelectedAttempt(null)}
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-[0_4px_12px_rgba(99,102,241,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer select-none"
              >
                Close Logs
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
