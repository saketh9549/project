import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VideoIndexer from './VideoIndexer';

export default function Home({
  currentUser,
  videos,
  playlists,
  fetchPlaylists,
  indexingLoading,
  pendingAutoSelectId,
  onIndexStart,
  onIndexSuccess,
  onIndexError,
  onDeleteVideo,
  showSuccess,
  showError
}) {
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';

  const [watchedList, setWatchedList] = useState([]);

  useEffect(() => {
    const loadWatched = () => {
      try {
        const val = localStorage.getItem('summarix_watched');
        const watched = val ? JSON.parse(val) : [];
        setWatchedList(Array.isArray(watched) ? watched : []);
      } catch (e) {
        console.error("Error loading watched list", e);
        setWatchedList([]);
      }
    };
    loadWatched();
    window.addEventListener('summarix_watched_change', loadWatched);
    return () => window.removeEventListener('summarix_watched_change', loadWatched);
  }, []);

  const handleSelectVideo = (video) => {
    navigate(`/video/${video.id}`);
  };

  const handleSelectFolder = (pl) => {
    const folderVideos = videos.filter(v => v.playlist_id === pl.id && v.upload_status === 'indexed');
    if (folderVideos.length > 0) {
      navigate(`/video/${folderVideos[0].id}`);
    } else {
      alert("This folder is empty or contains no indexed videos yet.");
    }
  };

  // Both Admin and Student view the same Dashboard
  return (
    <div className="max-w-5xl mx-auto w-full p-4 animate-quiz-slide">
      {/* Welcome header info card */}
      <div className="glass-panel p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden bg-gradient-to-br from-indigo-950/20 via-slate-900/10 to-cyan-950/10 text-center mb-8 shrink-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl -z-10" />

        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4 font-mono">
          Student Workspace
        </span>
        <h2 className="text-2xl font-extrabold font-display text-white mb-2 tracking-tight">
          Welcome back, <span className="bg-gradient-to-r from-cyan-400 to-indigo-300 bg-clip-text text-transparent">{currentUser?.username || currentUser?.email}</span>
        </h2>
        <p className="text-gray-400 text-xs max-w-md mx-auto leading-relaxed">
          Access course chapters, timestamps summaries, and evaluate your knowledge with custom module quizzes.
        </p>
      </div>

      {/* Course section */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold font-sans text-white tracking-tight">
            Continue Learning
          </h2>
          <div className="flex items-center gap-4">
            <span onClick={() => navigate('/catalog')} className="text-xs text-indigo-400 font-bold hover:underline cursor-pointer select-none">
              See all
            </span>
            <div className="flex gap-2">
              <button className="w-8 h-8 rounded-full border border-white/10 hover:bg-white/5 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-all select-none">
                &lt;
              </button>
              <button className="w-8 h-8 rounded-full border border-white/10 hover:bg-white/5 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-all select-none">
                &gt;
              </button>
            </div>
          </div>
        </div>

        {!Array.isArray(playlists) || playlists.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-12 font-mono border border-dashed border-white/5 rounded-2xl">
            No course modules currently assigned.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {playlists.map((pl) => {
              if (!pl) return null;
              const folderVideos = Array.isArray(videos)
                ? videos.filter(v => v && v.playlist_id === pl.id && v.upload_status === 'indexed')
                : [];
              const totalLessons = folderVideos.length;
              const watchedLessons = folderVideos.filter(v => v && Array.isArray(watchedList) && watchedList.includes(v.id)).length;
              const progressPercent = totalLessons > 0 ? Math.round((watchedLessons / totalLessons) * 100) : 0;

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
