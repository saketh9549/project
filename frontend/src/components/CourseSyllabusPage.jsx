import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/api';
import { downloadCertificatePdf } from '../lib/certificatePdf';

export default function CourseSyllabusPage({ videos, playlists, currentUser }) {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = currentUser?.role === 'admin';

  const [watchedList, setWatchedList] = useState([]);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [quizScores, setQuizScores] = useState({});
  const [showCertificate, setShowCertificate] = useState(false);
  const certificateRef = useRef(null);
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);

  useEffect(() => {
    const loadWatched = () => {
      try {
        const val = localStorage.getItem('summarix_watched');
        const watched = val ? JSON.parse(val) : [];
        setWatchedList(Array.isArray(watched) ? watched : []);
        
        const qVal = localStorage.getItem('summarix_completed_quizzes');
        const completed = qVal ? JSON.parse(qVal) : [];
        setCompletedQuizzes(Array.isArray(completed) ? completed : []);
      } catch (e) {
        console.error("Error loading watched lists", e);
        setWatchedList([]);
        setCompletedQuizzes([]);
      }
    };
    loadWatched();
    window.addEventListener('summarix_watched_change', loadWatched);
    window.addEventListener('summarix_completed_change', loadWatched);
    return () => {
      window.removeEventListener('summarix_watched_change', loadWatched);
      window.removeEventListener('summarix_completed_change', loadWatched);
    };
  }, []);

  const fetchScores = async () => {
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const res = await fetch(apiUrl(`/api/quizzes/user-scores?playlist_id=${playlistId}&owner_email=${encodeURIComponent(email)}`));
      if (res.ok) {
        const data = await res.json();
        setQuizScores(data || {});
      }
    } catch (err) {
      console.error("Failed to fetch user quiz scores:", err);
    }
  };

  useEffect(() => {
    if (playlistId) {
      fetchScores();
    }
  }, [playlistId, currentUser]);

  useEffect(() => {
    const handleScoresChange = () => {
      fetchScores();
    };
    window.addEventListener('summarix_quiz_scores_change', handleScoresChange);
    return () => window.removeEventListener('summarix_quiz_scores_change', handleScoresChange);
  }, [playlistId, currentUser]);

  useEffect(() => {
    const fetchQuizzes = async () => {
      setQuizzesLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/quizzes/list?playlist_id=${playlistId}`));
        if (res.ok) {
          const data = await res.json();
          setQuizzes(data);
        }
      } catch (err) {
        console.error("Failed to fetch quizzes list:", err);
      } finally {
        setQuizzesLoading(false);
      }
    };
    if (playlistId) {
      fetchQuizzes();
    }
  }, [playlistId]);

  const currentPlaylist = playlists.find(p => p.id === playlistId);

  if (!currentPlaylist) {
    return (
      <div className="max-w-md mx-auto w-full p-6 text-center glass-panel border border-white/5 rounded-xl shadow-xl mt-12 animate-quiz-slide">
        <h3 className="text-sm font-bold font-display text-white mb-2">Folder Not Found</h3>
        <p className="text-xs text-gray-400 mb-6">The requested folder or course module could not be found.</p>
        <button
          onClick={() => navigate(location.state?.from || '/home')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
        >
          Go Back
        </button>
      </div>
    );
  }

  let targetVideos = videos;
  if (location.state?.from === '/my-workspace' && currentUser?.email) {
    targetVideos = targetVideos.filter(v => v.owner_email === currentUser.email || v.ownerEmail === currentUser.email);
  }
  const folderVideos = Array.isArray(targetVideos)
    ? targetVideos.filter(v => v && v.playlist_id === playlistId && v.upload_status === 'indexed')
    : [];
  const totalLessons = folderVideos.length;

  const practiceQuizzes = quizzes.filter(q => q.catalog_id !== null && q.catalog_id !== undefined);
  const courseQuiz = quizzes.find(q => q.catalog_id === null || q.catalog_id === undefined);

  const backPath = '/';
  const backLabel = 'Back to Home';

  // Lock logic
  const quizVideoIds = new Set(practiceQuizzes.map(q => q.catalog_id).filter(Boolean));

  const isVideoUnlocked = (video, idx) => {
    if (isAdmin) return true;
    if (idx === 0) return true;
    for (let k = 0; k < idx; k++) {
      const prevVideo = folderVideos[k];
      if (quizVideoIds.has(prevVideo.id)) {
        const score = quizScores[prevVideo.id] || 0;
        if (score < 75) {
          return false;
        }
      }
    }
    return true;
  };

  const isMainQuizUnlocked = () => {
    if (isAdmin) return true;
    const allVideosWatched = folderVideos.every(v => Array.isArray(watchedList) && watchedList.includes(v.id));
    const allPracticeQuizzesPassed = practiceQuizzes.every(q => {
      const score = quizScores[q.catalog_id] || 0;
      return score >= 75;
    });
    return allVideosWatched && allPracticeQuizzesPassed;
  };

  const handleDownloadCertificate = async () => {
    setIsDownloadingCertificate(true);
    try {
      await downloadCertificatePdf(certificateRef.current, `${currentPlaylist?.name || 'summarix'}-certificate`);
    } catch (error) {
      alert(error.message || 'Unable to download the certificate. Please try again.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full p-6 md:p-8 animate-quiz-slide flex flex-col gap-8">
      {/* Back Button */}
      <div className="shrink-0 flex items-center">
        <button
          onClick={() => navigate(backPath, { state: location.state })}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-all cursor-pointer group"
        >
          <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {backLabel}
        </button>
      </div>

      {/* Course Hero Header (Borderless, Premium Glass/Glow Design) */}
      <div className="relative w-full pb-6 border-b border-white/5">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl -z-10" />
        <div className="absolute -top-12 -left-12 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl -z-10" />
        
        <h3 className="font-extrabold text-3xl md:text-4xl text-white tracking-tight leading-none font-display bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
          {currentPlaylist.name}
        </h3>
      </div>

      {/* Two Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        
        {/* Left Column: Course Lectures & Modules */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider font-display border-b border-slate-100 dark:border-white/5 pb-2 flex items-center justify-between">
            <span>Course Lectures & Modules</span>
            <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/10 px-2.5 py-0.5 rounded-full">
              {totalLessons} Lectures
            </span>
          </h4>

          {totalLessons === 0 ? (
            <div className="text-center text-gray-500 text-xs font-mono py-16 bg-white/2 rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
              No indexed videos inside this folder yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {folderVideos.map((video, idx) => {
                const isUnlocked = isVideoUnlocked(video, idx);
                const isWatched = Array.isArray(watchedList) && watchedList.includes(video.id);
                return (
                  <div
                    key={video.id}
                    onClick={() => {
                      if (isUnlocked) {
                        navigate(`/video/${video.id}`, {
                          state: {
                            from: `/course/${playlistId}`,
                            originalFrom: backPath
                          }
                        });
                      }
                    }}
                    className={`flex items-center justify-between p-3.5 px-4.5 border rounded-2xl transition-all shadow-md ${
                      isUnlocked
                        ? 'bg-slate-100/50 dark:bg-white/4 border-slate-200/80 dark:border-white/5 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/10 hover:translate-x-0.5 active:scale-[0.998] cursor-pointer group'
                        : 'bg-slate-50/[0.02] dark:bg-white/[0.01] border-slate-200/40 dark:border-white/3 opacity-50 cursor-not-allowed select-none'
                    }`}
                    title={isUnlocked ? "" : "Locked: Score 75%+ on preceding quiz to unlock."}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex items-center justify-center shrink-0 shadow-inner transition-all ${
                        isUnlocked ? 'text-slate-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10' : 'text-slate-400 dark:text-gray-600'
                      }`}>
                        {isUnlocked ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className={`text-xs font-bold transition-colors truncate ${
                          isUnlocked ? 'text-slate-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white' : 'text-slate-400 dark:text-gray-500'
                        }`}>
                          {video.file_name || `Module ${idx + 1}`}
                        </span>
                        {!isUnlocked && (
                          <span className="text-[8px] font-bold text-rose-400/80 mt-0.5">
                            Locked: Requires 75%+ on preceding quiz
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isUnlocked ? (
                        isWatched ? (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-gray-600 group-hover:border-gray-400 transition-colors flex items-center justify-center" />
                        )
                      ) : (
                        <div className="w-5 h-5 flex items-center justify-center text-gray-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Assignments & Quizzes */}
        <div className="flex flex-col gap-6">
          {/* Section 1: Practice Assignments */}
          <div className="flex flex-col gap-4">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2 flex items-center justify-between">
              <span>Practice Assignments</span>
              <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded-full">
                {practiceQuizzes.length} Quizzes
              </span>
            </h4>

            {quizzesLoading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : practiceQuizzes.length === 0 ? (
              <div className="text-center text-gray-500 text-xs font-mono py-12 bg-white/2 rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
                No practice quizzes in this folder.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[...practiceQuizzes].sort((a, b) => {
                  const idxA = a.catalog_id ? folderVideos.findIndex(v => v.id === a.catalog_id) : 999;
                  const idxB = b.catalog_id ? folderVideos.findIndex(v => v.id === b.catalog_id) : 999;
                  return idxA - idxB;
                }).map((quizItem) => {
                  const videoIdx = quizItem.catalog_id ? folderVideos.findIndex(v => v.id === quizItem.catalog_id) : -1;
                  const isUnlocked = videoIdx === -1 || isVideoUnlocked(folderVideos[videoIdx], videoIdx);
                  const isCompleted = Array.isArray(completedQuizzes) && completedQuizzes.includes(quizItem.catalog_id);
                  const highestScore = quizScores[quizItem.catalog_id] || null;

                  return (
                    <div
                      key={quizItem.id}
                      onClick={() => {
                        if (isUnlocked && quizItem.catalog_id) {
                          navigate(`/quiz/${quizItem.catalog_id}`, {
                            state: {
                              from: `/course/${playlistId}`,
                              originalFrom: backPath
                            }
                          });
                        }
                      }}
                      className={`flex items-center justify-between p-3.5 px-4.5 border rounded-2xl transition-all shadow-md ${
                        isUnlocked
                          ? 'bg-slate-100/50 dark:bg-white/4 border-slate-200/80 dark:border-white/5 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/10 hover:translate-x-0.5 active:scale-[0.998] cursor-pointer group'
                          : 'bg-slate-50/[0.02] dark:bg-white/[0.01] border-slate-200/40 dark:border-white/3 opacity-50 cursor-not-allowed select-none'
                      }`}
                      title={isUnlocked ? "" : "Locked: Score 75%+ on preceding quiz to unlock."}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex items-center justify-center shrink-0 shadow-inner transition-all ${
                          isUnlocked ? 'text-slate-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10' : 'text-slate-400 dark:text-gray-600'
                        }`}>
                          {isUnlocked ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <span className={`text-xs font-bold transition-colors truncate block ${
                            isUnlocked ? 'text-slate-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white' : 'text-slate-400 dark:text-gray-500'
                          }`}>
                            {quizItem.title}
                          </span>
                          <span className="text-[9px] text-slate-500 dark:text-gray-400 font-semibold truncate block mt-0.5">
                            {quizItem.associated_title}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 ml-2">
                        {highestScore !== null && (
                          <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            highestScore >= 75 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}>
                            {highestScore}%
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-gray-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded-full shrink-0">
                          {quizItem.questions_count} Qs
                        </span>
                        {isUnlocked ? (
                          isCompleted ? (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-gray-600 group-hover:border-gray-400 transition-colors flex items-center justify-center" />
                          )
                        ) : (
                          <div className="w-5 h-5 flex items-center justify-center text-gray-700">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Centered Final Course Assessment below both columns */}
      <div className="max-w-2xl mx-auto w-full border-t border-slate-200 dark:border-white/5 pt-8 mt-4">
        <div className="flex flex-col gap-4">
          <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider font-display border-b border-slate-100 dark:border-white/5 pb-2 flex items-center justify-between">
            <span>Final Course Assessment</span>
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Course Level
            </span>
          </h4>

          {quizzesLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : courseQuiz ? (
            (() => {
              const unlocked = isMainQuizUnlocked();
              const highestScore = quizScores[playlistId] || null;
              const isCompleted = (highestScore !== null && highestScore >= 75) || (Array.isArray(completedQuizzes) && completedQuizzes.includes(playlistId));

              return (
                <div className="flex flex-col gap-3">
                  <div
                    onClick={() => {
                      if (unlocked) {
                        navigate(`/quiz/course/${playlistId}`, {
                          state: {
                            from: `/course/${playlistId}`,
                            originalFrom: backPath
                          }
                        });
                      }
                    }}
                    className={`flex items-center justify-between p-4 px-5 border rounded-2xl transition-all shadow-lg ${
                      unlocked
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/10 hover:translate-x-0.5 active:scale-[0.998] cursor-pointer group'
                        : 'bg-slate-50/20 dark:bg-white/[0.01] border-slate-100 dark:border-white/3 opacity-40 cursor-not-allowed select-none'
                    }`}
                    title={unlocked ? "" : "Locked: Complete all lectures and practice quizzes to unlock."}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center shrink-0 shadow-inner transition-all ${
                        unlocked ? 'text-emerald-600 dark:text-emerald-400 group-hover:scale-110' : 'text-gray-600'
                      }`}>
                        <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className={`text-xs font-bold transition-colors truncate block ${
                          unlocked ? 'text-emerald-800 dark:text-emerald-300 group-hover:text-emerald-900 dark:group-hover:text-white' : 'text-gray-500'
                        }`}>
                          {courseQuiz.title}
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-gray-400 font-semibold truncate block mt-0.5">
                          {courseQuiz.questions_count} Comprehensive Questions
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      {highestScore !== null && (
                        <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          highestScore >= 75 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                          {highestScore}%
                        </span>
                      )}
                      {unlocked ? (
                        isCompleted ? (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-gray-600 dark:border-gray-400 group-hover:border-gray-400 transition-colors flex items-center justify-center" />
                        )
                      ) : (
                        <div className="w-5 h-5 flex items-center justify-center text-gray-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>

                  {isCompleted && (
                    <button
                      onClick={() => setShowCertificate(true)}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 mt-2 select-none animate-pulse"
                    >
                      <span>🎓</span> Claim Course Certificate
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => navigate(`/quiz/course/${playlistId}`)}
                      className="w-full py-2 border border-dashed border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-500/5 hover:bg-emerald-100/40 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer select-none mt-2"
                    >
                      ✏️ Edit Final Course Quiz
                    </button>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="text-center p-6 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl bg-slate-50/50 dark:bg-white/[0.01]">
              <p className="text-[10px] text-slate-500 dark:text-gray-500 italic mb-3">
                No final course-level quiz has been configured yet.
              </p>
              {isAdmin && (
                <button
                  onClick={() => navigate(`/quiz/course/${playlistId}`)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md select-none"
                >
                  ✨ Create Main Course Quiz
                </button>
              )}
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
                    in recognition of their successful completion of the <span className="font-semibold text-slate-900">{playlists.find(p => p && (p.id === playlistId || p._id === playlistId))?.name || 'Vite Course Playlist'}</span> certification program on <span className="font-semibold text-slate-900">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>.
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
    </div>
  );
}
