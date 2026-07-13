import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

// Circular Progress Component for Dials
function CircularProgress({ value, size = 64, strokeWidth = 6, colorClass = "text-cyan-400" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90 select-none" viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="text-white/5"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${colorClass} transition-all duration-500`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-[10px] font-extrabold text-white font-mono leading-none">{value}%</span>
        <span className="text-[7px] text-gray-500 uppercase font-bold tracking-tighter mt-0.5">Avg</span>
      </div>
    </div>
  );
}

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

  // Filtering selections: can filter by courseId or quizId
  const [filterCourseId, setFilterCourseId] = useState(null);
  const [filterQuizId, setFilterQuizId] = useState(null);

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

  const handleClearLogs = async () => {
    let confirmMsg = "Are you sure you want to delete ALL quiz attempts globally? This will reset progress for all students.";
    
    const email = currentUser?.email || 'anonymous@summarix.io';
    const role = currentUser?.role || 'user';
    let url;

    if (filterQuizId) {
      confirmMsg = "Are you sure you want to delete all attempts for the selected quiz? This will reset progress for all students.";
      url = apiUrl(`/api/quizzes/attempts?quiz_id=${filterQuizId}&owner_email=${encodeURIComponent(email)}&role=${role}`);
    } else if (filterCourseId) {
      confirmMsg = "Are you sure you want to delete all attempts for all quizzes in this course? This will reset progress for all students.";
      url = apiUrl(`/api/quizzes/attempts?playlist_id=${filterCourseId}&owner_email=${encodeURIComponent(email)}&role=${role}`);
    } else {
      url = apiUrl(`/api/quizzes/attempts?owner_email=${encodeURIComponent(email)}&role=${role}`);
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to clear attempts');
      }
      const resData = await res.json();
      showSuccess(resData.message || 'Attempts logs cleared successfully.');
      
      // Notify other views of the score reset
      window.dispatchEvent(new Event('summarix_quiz_scores_change'));
      
      await fetchAnalytics();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentUser]);

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

  // Global counts & filters
  const allAttempts = data.attempts || [];

  // Derive unique quizzes for the dropdown filter, optionally scoped to the selected course
  const availableQuizzes = Array.from(
    new Map(
      allAttempts
        .filter((a) => !filterCourseId || a.playlistId === filterCourseId)
        .map((a) => [a.quizId, { id: a.quizId, title: a.quizTitle }])
    ).values()
  );

  // Filter attempts dynamically based on course and quiz selections
  const currentFilteredAttempts = allAttempts.filter((a) => {
    const matchesCourse = !filterCourseId || a.playlistId === filterCourseId;
    const matchesQuiz = !filterQuizId || a.quizId === filterQuizId;
    const matchesSearch =
      a.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.username && a.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      a.quizTitle.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesScore =
      scoreFilter === 'all' ||
      (scoreFilter === 'pass' && a.score >= 75.0) ||
      (scoreFilter === 'fail' && a.score < 75.0);

    return matchesCourse && matchesQuiz && matchesSearch && matchesScore;
  });

  // Calculate stats dynamically for the active context (filtered course/quiz or global)
  const statsAttempts = allAttempts.filter(a => {
    const matchesCourse = !filterCourseId || a.playlistId === filterCourseId;
    const matchesQuiz = !filterQuizId || a.quizId === filterQuizId;
    return matchesCourse && matchesQuiz;
  });

  const totalAttempts = statsAttempts.length;
  const averageScore = totalAttempts > 0
    ? roundToTwo(statsAttempts.reduce((acc, val) => acc + val.score, 0) / totalAttempts)
    : 0.0;
  const passingAttempts = statsAttempts.filter(a => a.score >= 75.0).length;
  const passRate = totalAttempts > 0
    ? roundToTwo((passingAttempts / totalAttempts) * 100)
    : 0.0;

  const totalQuizzesCount = data.courses
    ? data.courses.reduce((acc, course) => acc + (course.quizzes?.length || 0), 0)
    : 0;

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
    <div className="max-w-6xl mx-auto w-full p-4 flex flex-col gap-6">
      <div className="animate-quiz-slide flex flex-col gap-6 flex-grow">

        {/* Simple Side Heading (Redesigned Header) */}
        <div className="flex items-center justify-between gap-4 shrink-0 mt-2">
          <div>
            <h2 className="text-xl font-extrabold font-display text-white tracking-tight">
              Quiz Analytics
            </h2>
          </div>

          {/* Global Refresh Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchAnalytics}
              className="p-2 border border-white/5 rounded-xl bg-white/3 text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer shadow-sm flex items-center justify-center"
              title="Reload Analytics"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-9 h-9 border-3 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-xs text-gray-500 font-mono">Loading dashboard metrics...</span>
          </div>
        ) : (
          <>
            {/* Dynamic Context Header with "Back to Folder Cards" button */}
            {(filterCourseId || filterQuizId) && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-950/20 text-xs text-indigo-300 font-semibold shrink-0 animate-fade-in shadow-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <span>
                    Filtering by: {' '}
                    {filterCourseId && (
                      <span className="capitalize text-white">
                        Course: <strong>{data.courses.find(c => c.id === filterCourseId)?.name || 'Course'}</strong>
                      </span>
                    )}
                    {filterQuizId && (
                      <span className="text-white">
                        {filterCourseId ? ' > ' : ''}Quiz: <strong>{
                          data.courses
                            .flatMap(c => c.quizzes || [])
                            .find(q => q.quizId === filterQuizId)?.quizTitle || 'Quiz'
                        }</strong>
                      </span>
                    )}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setFilterCourseId(null);
                    setFilterQuizId(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-white rounded-lg border border-white/5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm shrink-0"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Folder Cards
                </button>
              </div>
            )}

            {/* Performance Stats Dials (Compact Top Row) - ONLY shown when a card is selected */}
            {filterCourseId && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">

                {/* Stat 1: Total Attempts */}
                <div className="glass-panel p-3.5 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-gray-500 text-[9px] uppercase font-bold tracking-widest block">Total Attempts</span>
                    <span className="text-xl font-extrabold text-white mt-0.5 block leading-none">{totalAttempts}</span>
                    <span className="text-[8px] text-gray-500 block mt-1">graded submissions</span>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                    <svg className="w-4 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>

                {/* Stat 2: Avg Score Dial */}
                <div className="glass-panel p-3.5 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-gray-500 text-[9px] uppercase font-bold tracking-widest block">Average Score</span>
                    <span className="text-xl font-extrabold bg-gradient-to-r from-cyan-400 to-indigo-300 bg-clip-text text-transparent mt-0.5 block leading-none">{averageScore}%</span>
                    <span className="text-[8px] text-gray-500 block mt-1">out of 100% max</span>
                  </div>
                  <CircularProgress value={Math.round(averageScore)} size={48} strokeWidth={4.5} colorClass="text-cyan-400" />
                </div>

                {/* Stat 3: Pass Rate Dial */}
                <div className="glass-panel p-3.5 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-gray-500 text-[9px] uppercase font-bold tracking-widest block">Pass Rate</span>
                    <span className="text-xl font-extrabold text-emerald-400 mt-0.5 block leading-none">{passRate}%</span>
                    <span className="text-[8px] text-emerald-500/80 font-semibold block mt-1">passed (&ge; 75%)</span>
                  </div>
                  <CircularProgress value={Math.round(passRate)} size={48} strokeWidth={4.5} colorClass="text-emerald-400" />
                </div>

                {/* Stat 4: Unique Quizzes */}
                <div className="glass-panel p-3.5 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-gray-500 text-[9px] uppercase font-bold tracking-widest block">Unique Quizzes</span>
                    <span className="text-xl font-extrabold text-white mt-0.5 block leading-none">{totalQuizzesCount}</span>
                    <span className="text-[8px] text-gray-500 block mt-1">across all folders</span>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4 1.253" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Course Cards Grid - Hidden once a filter is active */}
            {!filterCourseId && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Course-Wise Performance View
                </h3>

                {(!data.courses || data.courses.length === 0) ? (
                  <div className="text-center text-xs text-gray-500 font-mono py-12 border border-white/5 rounded-2xl bg-white/3">
                    No folders or courses have quizzes configured yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {data.courses.map((course) => {
                      const cQuizzes = course.quizzes || [];

                      const isAnySelectedInCourse = filterCourseId === course.id;

                      return (
                        <div
                          key={course.id}
                          onClick={() => {
                            setFilterCourseId(course.id);
                            setFilterQuizId(null);
                          }}
                          className={`glass-panel rounded-2xl border transition-all duration-300 flex flex-col p-4 relative overflow-hidden select-none hover:translate-y-[-2px] cursor-pointer ${isAnySelectedInCourse
                              ? 'border-indigo-500/40 bg-indigo-500/[0.02] shadow-[0_8px_20px_rgba(99,102,241,0.06)]'
                              : 'border-white/5 bg-white/3 hover:bg-white/5 hover:border-white/10'
                            }`}
                        >
                          {/* Course Name Header (Simple click selection, filter button removed) */}
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <h4 className="text-xs font-black text-white hover:text-indigo-400 transition-colors capitalize truncate leading-tight" title={course.name}>
                                📁 {course.name}
                              </h4>
                              <span className="text-[9px] text-gray-500 font-medium block mt-0.5">
                                {cQuizzes.length} {cQuizzes.length === 1 ? 'quiz' : 'quizzes'} configured
                              </span>
                            </div>
                          </div>

                          {/* Quizzes list breakdown */}
                          <div className="flex flex-col gap-1.5 mt-auto pt-1">
                            <span className="text-[8px] text-gray-500 uppercase tracking-widest font-extrabold block mb-1">
                              Assessments Breakdown
                            </span>

                            {cQuizzes.length === 0 ? (
                              <span className="text-[9px] text-gray-500 italic">No quizzes configuration.</span>
                            ) : (
                              <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-0.5">
                                {cQuizzes.map((quiz) => {
                                  const isQuizSelected = filterQuizId === quiz.quizId;
                                  return (
                                    <div
                                      key={quiz.quizId}
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent triggering general parent course click
                                        setFilterCourseId(course.id);
                                        setFilterQuizId(quiz.quizId);
                                      }}
                                      className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-[10px] cursor-pointer transition-all ${isQuizSelected
                                          ? 'border-cyan-500/40 bg-cyan-500/10 text-white font-semibold'
                                          : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                      <span className="truncate max-w-[130px]" title={quiz.quizTitle}>
                                        📝 {quiz.quizTitle}
                                      </span>
                                      <div className="flex items-center gap-1.5 font-mono shrink-0">
                                        <span className="text-[8px] text-gray-500">{quiz.attemptsCount} attempts</span>
                                        <span className={`text-[8.5px] px-1 rounded font-bold ${quiz.averageScore >= 75 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                          }`}>
                                          {Math.round(quiz.averageScore)}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* High-density Attempt Submissions Feed */}
            <div className="glass-panel rounded-2xl overflow-hidden flex flex-col shadow-lg animate-fade-in">

              {/* Header Toolbar */}
              <div className="p-4 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 bg-white/2 shrink-0">
                <div className="flex items-center gap-2 self-start md:self-center">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    {filterCourseId || filterQuizId ? 'Filtered Submissions Feed' : 'Recent Attempts Feed'}
                  </h3>
                  <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-400 font-bold">
                    {currentFilteredAttempts.length} logs
                  </span>
                </div>

                {/* Inline Filters & Searches */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Search Input */}
                  <div className="relative flex-grow md:flex-grow-0">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search student, email, or quiz..."
                      className="w-full md:w-52 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500/40 transition-all"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-white cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Quiz Dropdown Selector */}
                  <select
                    value={filterQuizId || 'all'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFilterQuizId(val === 'all' ? null : val);
                    }}
                    className="bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500/40 cursor-pointer transition-all max-w-[180px]"
                  >
                    <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">All Quizzes</option>
                    {availableQuizzes.map(q => (
                      <option key={q.id} value={q.id} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                        {q.title}
                      </option>
                    ))}
                  </select>

                  {/* Outcome Select Filter */}
                  <select
                    value={scoreFilter}
                    onChange={(e) => setScoreFilter(e.target.value)}
                    className="bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500/40 cursor-pointer transition-all"
                  >
                    <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">All Scores</option>
                    <option value="pass" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">Passed (&ge; 75%)</option>
                    <option value="fail" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">Failed (&lt; 75%)</option>
                  </select>

                  {/* Clear Button */}
                  <button
                    onClick={handleClearLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-500 font-bold cursor-pointer transition-all active:scale-[0.97]"
                    title="Clear attempts logs"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear
                  </button>
                </div>
              </div>

              {/* Live attempts feed table */}
              <div className="overflow-x-auto w-full">
                {currentFilteredAttempts.length === 0 ? (
                  <div className="text-center text-xs text-gray-500 font-mono py-16">
                    No student submissions match the active filters.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] text-[9px] uppercase tracking-widest text-slate-500 dark:text-gray-500 font-mono">
                        <th className="py-3 px-5">Student</th>
                        <th className="py-3 px-5">Quiz Title</th>
                        <th className="py-3 px-5 text-center">Best Score</th>
                        <th className="py-3 px-5 text-center">Attempts</th>
                        <th className="py-3 px-5 text-center">Outcome</th>
                        <th className="py-3 px-5">Submitted At</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
                      {currentFilteredAttempts.map((attempt) => (
                        <tr
                          key={attempt.id}
                          className="hover:bg-slate-50/30 dark:hover:bg-white/[0.01] transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-slate-800 dark:text-white">{attempt.username}</div>
                            <div className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">{attempt.userEmail}</div>
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="font-medium text-slate-700 dark:text-gray-300 max-w-xs truncate" title={attempt.quizTitle}>
                              {attempt.quizTitle}
                            </div>
                            <div className="text-[8px] text-indigo-600 dark:text-indigo-400 font-bold uppercase mt-0.5">
                              📁 {attempt.courseName}
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-center font-mono font-bold text-slate-800 dark:text-white">
                            {attempt.score}%
                            <span className="block text-[9px] text-slate-400 dark:text-gray-500 font-normal">
                              {attempt.correctCount}/{attempt.totalCount} correct
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                              {attempt.attemptsCount || 1} {(attempt.attemptsCount || 1) === 1 ? 'attempt' : 'attempts'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${getScoreBadgeClass(attempt.score)}`}>
                              {getScoreBadgeText(attempt.score)}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-400 dark:text-gray-500 font-mono text-[11px]">
                            {formatDate(attempt.submittedAt)}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => setSelectedAttempt(attempt)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-white bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/40 border border-indigo-100 dark:border-indigo-500/20 dark:hover:border-indigo-500/40 cursor-pointer select-none transition-all"
                            >
                              Inspect
                              <svg className="w-3 h-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Drill-down Inspect Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/95 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.45)] backdrop-blur-xl flex flex-col overflow-hidden relative animate-quiz-slide">

            {/* Top gradient glowing bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-500 z-10" />

            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-start justify-between bg-slate-50/80 dark:bg-slate-950/40 pt-7">
              <div className="min-w-0 flex-grow">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[9px] font-extrabold text-slate-500 dark:text-gray-400 uppercase tracking-widest font-mono mb-2">
                  Attempt Breakdown
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white truncate max-w-[90%]" title={selectedAttempt.quizTitle}>
                  {selectedAttempt.quizTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                  <span>Student: <strong className="text-slate-900 dark:text-white">{selectedAttempt.username}</strong> ({selectedAttempt.userEmail})</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>Date: <span className="font-mono font-semibold">{formatDate(selectedAttempt.submittedAt)}</span></span>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedAttempt(null)}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 hover:scale-105 transition-all cursor-pointer shadow-sm border border-slate-200/50 dark:border-white/5"
                title="Close"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Stats Bar */}
            <div className="px-6 py-4 bg-slate-50/40 dark:bg-slate-950/20 border-b border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Submissions Score:</span>
                <span className="text-base font-extrabold bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent px-3 py-1 bg-slate-100/80 dark:bg-white/5 rounded-xl border border-slate-200/50 dark:border-white/5 shadow-sm">
                  {selectedAttempt.score}%
                </span>
                <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getScoreBadgeClass(selectedAttempt.score)}`}>
                  {getScoreBadgeText(selectedAttempt.score)}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-500 dark:text-gray-400 bg-slate-100/80 dark:bg-white/5 px-3 py-1 rounded-xl border border-slate-200/50 dark:border-white/5">
                <span className="text-cyan-600 dark:text-cyan-400 font-extrabold">{selectedAttempt.correctCount}</span>
                <span className="text-slate-500 dark:text-gray-500 font-normal"> / {selectedAttempt.totalCount} Correct</span>
              </div>
            </div>

            {/* Modal Content - Scrollable list of questions */}
            <div className="p-6 overflow-y-auto flex flex-col gap-6 flex-grow bg-slate-50/20 dark:bg-slate-900/10">
              {selectedAttempt.results.map((res, qIdx) => {
                const isCorrect = res.isCorrect;
                return (
                  <div
                    key={qIdx}
                    className={`p-5 rounded-2xl border transition-all duration-300 hover:translate-y-[-1px] ${isCorrect
                        ? 'border-emerald-200 bg-emerald-50/5 dark:border-emerald-500/20 dark:bg-emerald-500/[0.01] shadow-[0_4px_12px_rgba(16,185,129,0.015)]'
                        : 'border-rose-200 bg-rose-50/5 dark:border-rose-500/20 dark:bg-rose-500/[0.01] shadow-[0_4px_12px_rgba(244,63,94,0.015)]'
                      } flex flex-col gap-4`}
                  >
                    {/* Question text & correct marker */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-100 dark:bg-white/10 text-indigo-600 dark:text-indigo-400 rounded-md shrink-0 mt-0.5">
                          Q{qIdx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed">{res.questionText}</h4>
                      </div>
                      <div className="shrink-0">
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-emerald-500 dark:text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <svg className="w-3 h-3 stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-rose-500 dark:text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
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

                        let optionStyle = 'border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] text-slate-700 dark:text-gray-300 hover:bg-slate-100/70 dark:hover:bg-white/[0.03]';
                        if (isCorrectChoice) {
                          optionStyle = 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300 font-semibold shadow-[0_2px_8px_rgba(16,185,129,0.04)]';
                        } else if (isStudentChoice && !isCorrect) {
                          optionStyle = 'border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/[0.06] text-rose-700 dark:text-rose-300 font-semibold';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center justify-between border rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200 ${optionStyle}`}
                          >
                            <span>{option}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isStudentChoice && (
                                <span className="text-[8px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-white/10 text-slate-500 dark:text-gray-400 mr-1.5">
                                  Choice
                                </span>
                              )}
                              {isCorrectChoice && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                  <svg className="w-3 h-3 text-emerald-500 dark:text-emerald-400 stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                              {isStudentChoice && !isCorrect && (
                                <div className="w-5 h-5 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                                  <svg className="w-3 h-3 text-rose-500 dark:text-rose-400 stroke-[2.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      <div className="mt-1 pl-6 animate-fade-in">
                        <div className="flex items-center gap-1.5 text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wider mb-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Explanation
                        </div>
                        <div className="border-l-4 border-indigo-500 bg-slate-100/50 dark:bg-slate-950/40 p-3 rounded-r-xl">
                          <p className="text-[11px] text-slate-600 dark:text-gray-400 leading-relaxed italic">{res.explanation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-slate-950/40 text-center flex justify-end">
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
