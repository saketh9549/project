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
      const watched = JSON.parse(localStorage.getItem('summarix_watched') || '[]');
      setWatchedList(watched);
    };
    loadWatched();
    window.addEventListener('summarix_watched_change', loadWatched);
    return () => window.removeEventListener('summarix_watched_change', loadWatched);
  }, []);

  const handleSelectVideo = (video) => {
    navigate(`/video/${video.id}`);
  };

  const handleSelectFolder = (pl) => {
    // Record that the folder has been clicked/started by the user
    const started = JSON.parse(localStorage.getItem('summarix_started_folders') || '[]');
    if (!started.includes(pl.id)) {
      started.push(pl.id);
      localStorage.setItem('summarix_started_folders', JSON.stringify(started));
      // Dispatch a storage event to keep views in sync
      window.dispatchEvent(new Event('summarix_started_folders_change'));
    }

    const folderVideos = videos.filter(v => v.playlist_id === pl.id && v.upload_status === 'indexed');
    if (folderVideos.length > 0) {
      navigate(`/video/${folderVideos[0].id}`);
    } else {
      alert("This folder is empty or contains no indexed videos yet.");
    }
  };

  if (isAdmin) {
    return (
      <div className="flex-grow flex-1 flex flex-col max-w-4xl mx-auto w-full glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.05)] border border-white/5 min-h-0 animate-quiz-slide">
        <h2 className="text-xl font-bold text-center text-white mb-6 font-display flex items-center justify-center gap-2 shrink-0">
          <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Index New Video File
        </h2>
        <div className="flex-grow overflow-y-auto pr-1">
          <VideoIndexer
            videos={videos}
            indexingLoading={indexingLoading}
            playlists={playlists}
            fetchPlaylists={fetchPlaylists}
            pendingAutoSelectId={pendingAutoSelectId}
            onIndexStart={onIndexStart}
            onIndexSuccess={(videoId) => {
              onIndexSuccess(videoId);
              navigate(`/video/${videoId}`);
            }}
            onIndexError={onIndexError}
            onDeleteVideo={onDeleteVideo}
            showSuccess={showSuccess}
            showError={showError}
          />
        </div>
      </div>
    );
  }

  // Student view: LMS "Continue Learning" Cards Grid (Image 1 style)
  return (
    <div className="flex-grow flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 animate-quiz-slide justify-center my-auto">
      {/* Welcome header info card */}
      <div className="glass-panel p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden bg-gradient-to-br from-indigo-950/20 via-slate-900/10 to-cyan-950/10 text-center mb-8">
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
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold font-sans text-white tracking-tight">
            Continue Learning
          </h2>
          <div className="flex items-center gap-4">
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

        {playlists.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-12 font-mono border border-dashed border-white/5 rounded-2xl">
            No course modules currently assigned.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {playlists.map((pl) => {
              const folderVideos = videos.filter(v => v.playlist_id === pl.id && v.upload_status === 'indexed');
              const totalLessons = folderVideos.length;
              const watchedLessons = folderVideos.filter(v => watchedList.includes(v.id)).length;
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
