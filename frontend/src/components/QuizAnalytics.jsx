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

  const toggleCourse = (courseId) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
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
      const response = await fetch(apiUrl('/api/quizzes/analytics'));
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
  }, []);

  useEffect(() => {
    if (data.courses && data.courses.length > 0) {
      // Auto-expand the first course by default
      const firstCourseId = data.courses[0].id;
      setExpandedCourses({ [firstCourseId]: true });
    }
  }, [data.courses]);

  // Filter attempts based on search and score dropdown
  const filteredAttempts = data.attempts.filter((attempt) => {
    const matchesSearch =
      attempt.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attempt.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attempt.quizTitle.toLowerCase().includes(searchTerm.toLowerCase());

    if (scoreFilter === 'pass') {
      return matchesSearch && attempt.score >= 50.0;
    } else if (scoreFilter === 'fail') {
      return matchesSearch && attempt.score < 50.0;
    }
    return matchesSearch;
  });

  const getScoreBadgeClass = (score) => {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (score >= 50) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
    return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  };

  const getScoreBadgeText = (score) => {
    if (score >= 80) return 'High Pass';
    if (score >= 50) return 'Pass';
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

  const uniqueQuizzesCount = data.courses ? data.courses.reduce((acc, course) => acc + course.quizzes.length, 0) : 0;

  return (
    <div className="max-w-5xl mx-auto w-full p-4 animate-quiz-slide flex flex-col gap-8">
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
          {/* Stats Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Total Attempts */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-row justify-between items-center relative overflow-hidden transition-all duration-300">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Total Attempts</span>
                <span className="text-3xl font-extrabold font-display text-white">{data.stats.totalAttempts}</span>
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
                <span className="text-3xl font-extrabold font-display bg-gradient-to-r from-cyan-500 to-indigo-500 dark:from-cyan-400 dark:to-indigo-300 bg-clip-text text-transparent">{data.stats.averageScore}%</span>
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
                <span className="text-3xl font-extrabold font-display text-white">{data.stats.passRate}%</span>
                <span className="text-[10px] text-emerald-500 font-bold">&gt;= 50% score</span>
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
                  
                  return (
                    <div key={course.id} className="glass-panel rounded-2xl overflow-hidden shadow-md border border-black/5 dark:border-white/5 transition-all">
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
                            <h4 className="font-extrabold text-sm text-slate-800 dark:text-white capitalize">
                              {course.name}
                            </h4>
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

      {/* Drill-down Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-2xl max-h-[85vh] rounded-3xl border border-black/10 dark:border-white/5 bg-slate-50 dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden relative">

            {/* Modal Header */}
            <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-start justify-between bg-black/[0.02] dark:bg-slate-950/40">
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono mb-2">
                  Attempt Breakdown
                </span>
                <h3 className="text-md font-bold text-slate-800 dark:text-white truncate max-w-md" title={selectedAttempt.quizTitle}>
                  {selectedAttempt.quizTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Student: <strong className="text-slate-800 dark:text-white">{selectedAttempt.username}</strong> ({selectedAttempt.userEmail})</span>
                  <span className="text-gray-600">•</span>
                  <span>Date: <span className="font-mono">{formatDate(selectedAttempt.submittedAt)}</span></span>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedAttempt(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Stats Bar */}
            <div className="px-6 py-3 bg-black/[0.01] dark:bg-slate-950/20 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-gray-500 uppercase">Submissions Score:</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white">{selectedAttempt.score}%</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getScoreBadgeClass(selectedAttempt.score)}`}>
                  {getScoreBadgeText(selectedAttempt.score)}
                </span>
              </div>
              <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                <strong>{selectedAttempt.correctCount}</strong> / {selectedAttempt.totalCount} Correct Questions
              </div>
            </div>

            {/* Modal Content - Scrollable list of questions */}
            <div className="p-6 overflow-y-auto flex flex-col gap-6 flex-grow">
              {selectedAttempt.results.map((res, qIdx) => {
                const hasSelected = res.selectedOptionIdx !== -1;
                const isCorrect = res.isCorrect;
                return (
                  <div
                    key={qIdx}
                    className={`p-4 rounded-2xl border ${isCorrect
                      ? 'border-emerald-500/20 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01]'
                      : 'border-amber-500/20 bg-amber-500/[0.02] dark:bg-amber-500/[0.01]'
                      } flex flex-col gap-3`}
                  >
                    {/* Question text & correct marker */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-2">
                        <span className="text-xs font-mono font-bold text-gray-500">Q{qIdx + 1}.</span>
                        <h4 className="text-xs font-semibold text-slate-800 dark:text-white leading-relaxed">{res.questionText}</h4>
                      </div>
                      <div>
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-emerald-500 dark:text-emerald-400 uppercase">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold font-mono text-amber-500 dark:text-amber-400 uppercase">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Incorrect
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Options list */}
                    <div className="flex flex-col gap-2 pl-6">
                      {res.options.map((option, optIdx) => {
                        const isStudentChoice = res.selectedOptionIdx === optIdx;
                        const isCorrectChoice = res.correctAnswerIdx === optIdx;

                        let optionStyle = 'border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.02] text-slate-700 dark:text-gray-300';
                        if (isCorrectChoice) {
                          optionStyle = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium';
                        } else if (isStudentChoice && !isCorrect) {
                          optionStyle = 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center justify-between border rounded-xl px-3 py-2 text-xs transition-all ${optionStyle}`}
                          >
                            <span>{option}</span>
                            <div className="flex items-center gap-1">
                              {isStudentChoice && (
                                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mr-1">
                                  Choice
                                </span>
                              )}
                              {isCorrectChoice && (
                                <svg className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {isStudentChoice && !isCorrect && (
                                <svg className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {res.explanation && (
                      <div className="mt-1 pl-6">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Explanation:</div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">{res.explanation}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-slate-950/40 text-center">
              <button
                onClick={() => setSelectedAttempt(null)}
                className="px-6 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold text-slate-800 dark:text-white rounded-xl border border-black/10 dark:border-white/10 transition-all cursor-pointer select-none"
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
