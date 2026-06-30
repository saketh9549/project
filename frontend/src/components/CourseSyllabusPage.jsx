import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/api';

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
    return () => window.removeEventListener('summarix_watched_change', loadWatched);
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
  const watchedLessons = folderVideos.filter(v => v && Array.isArray(watchedList) && watchedList.includes(v.id)).length;
  const progressPercent = totalLessons > 0 ? Math.round((watchedLessons / totalLessons) * 100) : 0;

  const backPath = location.state?.from || '/home';
  const backLabel = backPath === '/my-workspace' ? 'Back to My Workspace' : (backPath === '/catalog' ? 'Back to Upload Library' : 'Back to Dashboard');

  // Lock logic
  const quizVideoIds = new Set(quizzes.map(q => q.catalog_id).filter(Boolean));

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

  return (
    <div className="max-w-4xl mx-auto w-full p-4 animate-quiz-slide flex flex-col gap-3 min-h-0 h-full max-h-full">
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

      <div className="glass-panel w-full rounded-2xl overflow-hidden shadow-2xl border border-white/5 relative flex flex-col bg-gradient-to-b from-slate-950/80 to-slate-900/20 backdrop-blur-xl min-h-0 flex-grow max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white relative shrink-0 shadow-md">
          <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full blur-2xl -z-10" />
          <h3 className="font-extrabold text-lg tracking-tight leading-snug font-display">
            {currentPlaylist.name}
          </h3>
          <div className="mt-4 pt-2.5 border-t border-white/15">
            <div className="flex justify-between items-center text-[10px] font-extrabold font-mono tracking-wider">
              <span>{progressPercent}% COMPLETE</span>
              <span className="opacity-80">{watchedLessons}/{totalLessons} Lessons</span>
            </div>
            <div className="w-full bg-black/25 rounded-full h-1.5 overflow-hidden mt-1.5">
              <div
                className="h-full bg-white transition-[width] duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Two Columns View */}
        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5 min-h-0 overflow-hidden">
          
          {/* Left Column: Course Lectures & Modules */}
          <div className="flex flex-col p-4.5 min-h-0 overflow-y-auto">
            <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
              Course Lectures & Modules
            </h4>
            {totalLessons === 0 ? (
              <div className="text-center text-gray-500 text-xs font-mono py-12 bg-white/2 rounded-xl border border-dashed border-white/5 flex-grow flex items-center justify-center">
                No indexed videos inside this folder yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
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
                      className={`flex items-center justify-between p-2.5 px-3.5 border rounded-xl transition-all shadow-sm ${
                        isUnlocked
                          ? 'bg-white/3 border-white/5 hover:bg-white/10 hover:border-white/10 hover:scale-[1.002] active:scale-[0.998] cursor-pointer group'
                          : 'bg-white/[0.01] border-white/3 opacity-40 cursor-not-allowed select-none'
                      }`}
                      title={isUnlocked ? "" : "Locked: Score 75%+ on preceding quiz to unlock."}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* List icon on the left */}
                        <div className={`w-7 h-7 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 shadow-inner transition-colors ${
                          isUnlocked ? 'text-gray-400 group-hover:text-cyan-400' : 'text-gray-600'
                        }`}>
                          {isUnlocked ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <span className={`text-xs font-bold transition-colors truncate ${
                            isUnlocked ? 'text-gray-200 group-hover:text-white' : 'text-gray-500'
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

                      {/* Round checkmark status indicator */}
                      <div className="shrink-0 ml-2">
                        {isUnlocked ? (
                          isWatched ? (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
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
          <div className="flex flex-col p-4.5 min-h-0 overflow-y-auto">
            <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
              Assignments & Quizzes
            </h4>
            {quizzesLoading ? (
              <div className="flex-grow flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : quizzes.length === 0 ? (
              <div className="text-center text-gray-500 text-xs font-mono py-16 bg-white/2 rounded-xl border border-dashed border-white/5 flex-grow flex items-center justify-center">
                No quizzes or assessments inside this folder yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {quizzes.map((quizItem) => {
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
                      className={`flex items-center justify-between p-2.5 px-3.5 border rounded-xl transition-all shadow-sm ${
                        isUnlocked
                          ? 'bg-white/3 border-white/5 hover:bg-white/10 hover:border-white/10 hover:scale-[1.002] active:scale-[0.998] cursor-pointer group'
                          : 'bg-white/[0.01] border-white/3 opacity-40 cursor-not-allowed select-none'
                      }`}
                      title={isUnlocked ? "" : "Locked: Score 75%+ on preceding quiz to unlock."}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Quiz Icon */}
                        <div className={`w-7 h-7 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 shadow-inner transition-colors ${
                          isUnlocked ? 'text-gray-400 group-hover:text-cyan-400' : 'text-gray-600'
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
                            isUnlocked ? 'text-gray-200 group-hover:text-white' : 'text-gray-500'
                          }`}>
                            {quizItem.title}
                          </span>
                          <span className="text-[9px] text-gray-500 font-semibold truncate block mt-0.5">
                            {quizItem.associated_title}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {highestScore !== null && (
                          <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            highestScore >= 75 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {highestScore}%
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                          {quizItem.questions_count} Qs
                        </span>
                        {/* Round checkmark status indicator */}
                        {isUnlocked ? (
                          isCompleted ? (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
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
    </div>
  );
}
