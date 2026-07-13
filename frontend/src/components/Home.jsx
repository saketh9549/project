import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/api';

export default function Home({
  currentUser,
  videos,
  playlists,
  myWorkspaceMode = false
}) {
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';

  const [watchedList, setWatchedList] = useState([]);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [allVideos, setAllVideos] = useState([]);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [playlistQuizzes, setPlaylistQuizzes] = useState({});
  const [playlistQuizScores, setPlaylistQuizScores] = useState({});

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
        console.error("Error loading watched list", e);
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

  useEffect(() => {
    if (!isAdmin) return;
    const fetchAllData = async () => {
      try {
        const email = currentUser?.email || 'anonymous@summarix.io';
        const role = currentUser?.role || 'user';
        const plRes = await fetch(apiUrl(`/api/playlists?all=true&owner_email=${encodeURIComponent(email)}&role=${role}`));
        if (plRes.ok) {
          const plData = await plRes.json();
          setAllPlaylists(plData);
        }
        const vidRes = await fetch(apiUrl(`/api/videos?all=true&owner_email=${encodeURIComponent(email)}&role=${role}`));
        if (vidRes.ok) {
          const vidData = await vidRes.json();
          setAllVideos(vidData);
        }
      } catch (err) {
        console.error("Failed to fetch admin all data:", err);
      }
    };
    fetchAllData();
  }, [isAdmin, videos, playlists, currentUser]);

  const handleSelectFolder = (pl) => {
    navigate(`/course/${pl.id}`, { state: { from: myWorkspaceMode ? '/my-workspace' : '/home' } });
  };

  const displayPlaylists = myWorkspaceMode && currentUser?.email
    ? (isAdmin ? allPlaylists : playlists).filter(pl => pl.owner_email === currentUser.email || pl.ownerEmail === currentUser.email)
    : (isAdmin ? allPlaylists : playlists);

  useEffect(() => {
    if (!displayPlaylists || displayPlaylists.length === 0) return;
    
    const fetchQuizzesAndScores = async () => {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const quizzesMap = {};
      const scoresMap = {};
      
      await Promise.all(displayPlaylists.map(async (pl) => {
        if (!pl || !pl.id) return;
        try {
          const qRes = await fetch(apiUrl(`/api/quizzes/list?playlist_id=${pl.id}`));
          if (qRes.ok) {
            quizzesMap[pl.id] = await qRes.json();
          }
          
          const sRes = await fetch(apiUrl(`/api/quizzes/user-scores?playlist_id=${pl.id}&owner_email=${encodeURIComponent(email)}`));
          if (sRes.ok) {
            scoresMap[pl.id] = await sRes.json();
          }
        } catch (err) {
          console.error(`Failed to fetch quiz info for playlist ${pl.id}:`, err);
        }
      }));
      
      setPlaylistQuizzes(quizzesMap);
      setPlaylistQuizScores(scoresMap);
    };
    
    fetchQuizzesAndScores();
  }, [displayPlaylists, currentUser]);

  // Both Admin and Student view the same Dashboard structure but scoped differently
  return (
    <div className="max-w-5xl mx-auto w-full p-4 animate-quiz-slide">

      {/* Course section */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold font-sans text-white tracking-tight">
            {myWorkspaceMode ? "My Course Modules" : (isAdmin ? "All Course Modules" : "Continue Learning")}
          </h2>
          <div className="flex items-center gap-4">
            <span onClick={() => navigate('/catalog')} className="text-xs text-indigo-400 font-bold hover:underline cursor-pointer select-none">
              See all
            </span>
          </div>
        </div>

        {!Array.isArray(displayPlaylists) || displayPlaylists.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-12 font-mono border border-dashed border-white/5 rounded-2xl">
            No course modules currently assigned.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayPlaylists.map((pl) => {
              if (!pl) return null;
              const targetVideos = isAdmin ? allVideos : videos;
              const folderVideos = Array.isArray(targetVideos)
                ? targetVideos.filter(v => v && v.playlist_id === pl.id && v.upload_status === 'indexed')
                : [];
              const totalLessons = folderVideos.length;
              const watchedLessons = folderVideos.filter(v => v && Array.isArray(watchedList) && watchedList.includes(v.id)).length;

              const quizzesInPlaylist = playlistQuizzes[pl.id] || [];
              const scoresForPlaylist = playlistQuizScores[pl.id] || {};
              const totalQuizzes = quizzesInPlaylist.length;
              const completedQuizzesCount = quizzesInPlaylist.filter(q => {
                const isCourseQuiz = !q.catalog_id;
                const key = isCourseQuiz ? pl.id : q.catalog_id;
                const score = scoresForPlaylist[key] || 0;
                const isCompletedInLocal = Array.isArray(completedQuizzes) && completedQuizzes.includes(key);
                return score >= 75 || isCompletedInLocal;
              }).length;

              const totalItems = totalLessons + totalQuizzes;
              const completedItems = watchedLessons + completedQuizzesCount;
              const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

              return (
                <div
                  key={pl.id}
                  onClick={() => handleSelectFolder(pl)}
                  className="glass-panel rounded-2xl overflow-hidden border border-white/5 shadow-lg cursor-pointer glass-panel-hover flex flex-col justify-between"
                >
                  {/* Course Thumbnail Image Box */}
                  <div className="h-36 relative select-none border-b border-white/5 overflow-hidden bg-gray-950/40">
                    {pl.cover_image ? (
                      <img
                        src={pl.cover_image}
                        alt={pl.name}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      /* Clean fallback folder visual: no custom text, just a clean folder icon */
                      <div className="w-full h-full flex items-center justify-center bg-gray-900/20 text-indigo-400/60">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Course Details and Progress indicators */}
                  <div className="p-4 flex flex-col gap-3">
                    <div>
                      <h3 className="font-bold text-xs text-white font-sans truncate leading-snug" title={pl.name}>
                        {pl.name}
                      </h3>
                      <p className="text-[9px] text-gray-500 font-semibold mt-0.5">
                        Course Module
                      </p>
                    </div>

                    {/* Progress details */}
                    {isAdmin ? (
                      <div className="flex justify-between text-[10px] font-bold font-mono text-gray-500 mt-2">
                        <span>{totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.3)] transition-[width] duration-500 ease-out"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold font-mono">
                          <span className="text-cyan-400">{progressPercent}%</span>
                          <span className="text-gray-500">{watchedLessons}/{totalLessons} Lessons</span>
                        </div>
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
  );
}
