import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import VideosCatalog from './VideosCatalog';

export default function CatalogPage({
  videos,
  playlists,
  onDeleteVideo,
  onDeletePlaylist,
  onUpdateVideoPlaylist,
  currentUser,
  fetchPlaylists,
  fetchVideos,
  indexingLoading,
  pendingAutoSelectId,
  onIndexStart,
  onIndexSuccess,
  onIndexError,
  showSuccess,
  showError
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const initialOpenUpload = location.state?.openUpload || false;
  const initialPlaylistId = location.state?.playlistId || '';
  const isAdmin = currentUser?.role === 'admin';

  // State to re-evaluate watched progress on change
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
    navigate(`/video/${video.id}`, { state: { from: '/catalog' } });
  };

  const handleSelectFolder = (pl) => {
    navigate(`/course/${pl.id}`, { state: { from: '/catalog' } });
  };

  // If Admin, show the standard folder catalog with folder builder and delete actions
  if (isAdmin) {
    return (
      <div className="flex-grow flex-1 flex flex-col max-w-5xl mx-auto w-full glass-panel p-6 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.05)] border border-white/5 min-h-0 animate-quiz-slide">
        <div className="flex items-center gap-2 mb-6 shrink-0">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h2 className="text-base font-extrabold text-white tracking-tight">
            Content Manager Library
          </h2>
        </div>
        <div className="flex-grow flex flex-col min-h-0">
          <VideosCatalog
            videos={videos}
            playlists={playlists}
            selectedVideo={null}
            onSelectVideo={handleSelectVideo}
            onDeleteVideo={onDeleteVideo}
            onDeletePlaylist={onDeletePlaylist}
            onUpdateVideoPlaylist={onUpdateVideoPlaylist}
            isAdmin={true}
            fetchPlaylists={fetchPlaylists}
            fetchVideos={fetchVideos}
            indexingLoading={indexingLoading}
            pendingAutoSelectId={pendingAutoSelectId}
            onIndexStart={onIndexStart}
            onIndexSuccess={onIndexSuccess}
            onIndexError={onIndexError}
            showSuccess={showSuccess}
            showError={showError}
            initialOpenUpload={initialOpenUpload}
            initialPlaylistId={initialPlaylistId}
            currentUser={currentUser}
          />
        </div>
      </div>
    );
  }

  // Student view: LMS "Continue Learning" Cards Grid (Image 1 style)
  return (
    <div className="max-w-5xl mx-auto w-full p-4 animate-quiz-slide">
      {/* Subject cards slider */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold font-sans text-white tracking-tight">
            Continue Learning
          </h2>
        </div>

        {playlists.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-16 font-mono border border-dashed border-white/5 rounded-2xl">
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
                  <div className="h-40 relative select-none border-b border-white/5 overflow-hidden bg-gray-950/40">
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
                  <div className="p-5 flex flex-col gap-4">
                    <div>
                      <h3 className="font-bold text-sm text-white font-sans truncate leading-snug" title={pl.name}>
                        {pl.name}
                      </h3>
                      <p className="text-[10px] text-gray-500 font-semibold mt-1">
                        Course Module
                      </p>
                    </div>

                    {/* Progress details */}
                    <div className="flex flex-col gap-1.5">
                      {/* Thick Progress bar */}
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.3)] transition-[width] duration-500 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-bold font-mono">
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
