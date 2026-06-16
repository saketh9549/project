import { useState, useEffect } from 'react';
import StatusAlerts from './components/StatusAlerts';
import VideosCatalog from './components/VideosCatalog';
import VideoIndexer from './components/VideoIndexer';
import TimelineExplorer from './components/TimelineExplorer';
import SummaryConsole from './components/SummaryConsole';
import AuthPage from './components/AuthPage';

import { apiUrl } from './lib/api';


export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const userJson = localStorage.getItem('summarix_user');
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  });
  const [videos, setVideos] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [pendingAutoSelectId, setPendingAutoSelectId] = useState(() => {
    return localStorage.getItem('summarix_pending_select') || null;
  });

  // Appearance / Theme states
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('summarix_theme') || 'dark';
  });
  const [showSettings, setShowSettings] = useState(false);

  // Loading & status states
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return (window.innerWidth - 48) / 2;
    }
    return 500;
  });
  const [overallSummary, setOverallSummary] = useState(null);
  const [overallSummaryLoading, setOverallSummaryLoading] = useState(false);

  const showError = (msg) => {
    setErrorMsg(msg);
    if (msg) setSuccessMsg(null);
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    if (msg) setErrorMsg(null);
  };

  const fetchVideos = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(apiUrl('/api/videos'));
      if (!response.ok) throw new Error('Failed to fetch videos');
      const data = await response.json();
      setVideos(data);
    } catch (err) {
      showError('Could not load videos catalog: ' + err.message);
    }
  };

  const fetchPlaylists = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(apiUrl('/api/playlists'));
      if (!response.ok) throw new Error('Failed to fetch playlists');
      const data = await response.json();
      setPlaylists(data);
    } catch (err) {
      showError('Could not load playlists: ' + err.message);
    }
  };

  const handleSelectVideo = async (video) => {
    setSelectedVideo(video);
    setSelectedChapter(null);
    setOverallSummary(null);
    showSuccess(null);
    showError(null);

    try {
      const response = await fetch(apiUrl(`/api/videos/${video.id}`));
      if (!response.ok) throw new Error('Failed to load video chapters');
      const data = await response.json();
      setChapters(data.chapters || []);
      if (data.video) {
        setSelectedVideo(data.video);
      }
      if (data.video && data.video.overall_summary) {
        setOverallSummary(data.video.overall_summary);
      }
    } catch (err) {
      showError('Could not load video chapters: ' + err.message);
    }
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = window.innerWidth - 300; // protect center panel min width (300px)
      const newWidth = Math.max(280, Math.min(maxW, startWidth - deltaX));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };



  // Apply theme class to document root
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('summarix_theme', theme);
  }, [theme]);

  // Fetch videos list on mount or user changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVideos();
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Polling for processing/indexing videos
  useEffect(() => {
    const hasProcessingVideos = videos.some(
      (v) => v.upload_status === 'queued' || v.upload_status === 'indexing'
    );

    if (!hasProcessingVideos) return;

    const interval = setInterval(() => {
      fetchVideos();
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  // Auto-select pending video once it completes indexing and summary generation
  useEffect(() => {
    const pendingId = pendingAutoSelectId || localStorage.getItem('summarix_pending_select');
    if (!pendingId || videos.length === 0) return;

    const matchedVideo = videos.find((v) => v.id === pendingId);
    if (matchedVideo && matchedVideo.upload_status === 'indexed') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleSelectVideo(matchedVideo);
      setPendingAutoSelectId(null);
      localStorage.removeItem('summarix_pending_select');
      showSuccess(`Video "${matchedVideo.file_name}" has finished indexing and is ready!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, pendingAutoSelectId]);

  // Auto-dismiss success and error notifications after 2 seconds
  useEffect(() => {
    if (errorMsg || successMsg) {
      // Do not auto-dismiss active loading/progress alerts
      const isProgress = (successMsg && (successMsg.includes('Please wait') || successMsg.includes('Uploading')));
      if (isProgress) return;

      const timer = setTimeout(() => {
        setErrorMsg(null);
        setSuccessMsg(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, successMsg]);



  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this video and all its indexed moments from the database?')) return;

    try {
      const res = await fetch(apiUrl('/api/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete video');

      showSuccess('Video deleted successfully.');
      if (selectedVideo && selectedVideo.id === videoId) {
        setSelectedVideo(null);
        setChapters([]);
        setSelectedChapter(null);
      }
      await fetchVideos();
      await fetchPlaylists();
    } catch (err) {
      showError('Deletion failed: ' + err.message);
    }
  };

  const handleDeletePlaylist = async (e, playlistId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder and all its videos from the database?')) return;

    try {
      const res = await fetch(apiUrl(`/api/playlists/${playlistId}`), {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to delete folder');

      showSuccess('Folder deleted successfully.');
      if (selectedVideo && selectedVideo.playlist_id === playlistId) {
        setSelectedVideo(null);
        setChapters([]);
        setSelectedChapter(null);
      }
      await fetchPlaylists();
      await fetchVideos();
    } catch (err) {
      showError('Deletion failed: ' + err.message);
    }
  };

  const handleUpdateVideoPlaylist = async (videoId, playlistId) => {
    if (!currentUser) return;
    try {
      const response = await fetch(apiUrl(`/api/videos/${videoId}/playlist`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to update playlist');

      showSuccess('Video playlist updated successfully.');
      await fetchVideos();
      await fetchPlaylists();
    } catch (err) {
      showError('Failed to move video: ' + err.message);
    }
  };

  const handleGenerateOverallSummary = async () => {
    if (!selectedVideo) return;

    setOverallSummaryLoading(true);
    showError(null);
    showSuccess('Generating overall summary with Gemini... Please wait.');

    try {
      const response = await fetch(apiUrl('/api/overall-summary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: selectedVideo.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate overall summary');

      setOverallSummary(data.overall_summary);
      showSuccess('Overall summary generated successfully!');
    } catch (err) {
      showError('Failed to generate overall summary: ' + err.message);
    } finally {
      setOverallSummaryLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5 bg-gray-950/40 backdrop-blur-md px-8 py-3 flex items-center justify-between sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <svg className="h-9.5 w-9.5 shadow-[0_0_15px_rgba(11,46,102,0.4)] rounded-xl" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="24" fill="#0b2e66" />
            <text x="50" y="56" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="46" fill="#ffffff" textAnchor="middle">S</text>
            <rect x="14" y="68" width="26" height="16" rx="8" fill="#1b4995" />
            <rect x="28" y="68" width="24" height="16" rx="8" fill="#2e69bf" />
            <rect x="42" y="68" width="22" height="16" rx="8" fill="#4b8bec" />
            <rect x="54" y="68" width="20" height="16" rx="8" fill="#7eb2ff" />
            <rect x="64" y="68" width="22" height="16" rx="8" fill="#ffffff" />
          </svg>
          <div>
            <h1 className="text-xl font-bold font-display bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent tracking-tight logo-text">
              Summarix
            </h1>
            <p className="text-xs text-cyan-400 font-semibold tracking-widest uppercase mt-0.5">
              Video & Podcast Summary Generator
            </p>
          </div>
        </div>

        {/* Status Alerts Banners (Centered) */}
        <div className="flex-1 hidden md:flex justify-center px-4 max-w-lg mx-auto">
          <StatusAlerts
            errorMsg={errorMsg}
            successMsg={successMsg}
            onClear={() => { setErrorMsg(null); setSuccessMsg(null); }}
          />
        </div>

        {/* User, Settings, Auth controls (Right-aligned) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 relative">
          {currentUser && (
            <div className="flex items-center gap-2 sm:gap-3 mr-2 bg-white/5 border border-white/5 py-1 px-3 rounded-xl">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-xs text-white font-medium truncate max-w-[150px]" title={currentUser.username || currentUser.email}>
                  {currentUser.username || currentUser.email}
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wider ${
                  currentUser.role === 'admin' ? 'text-indigo-400' : 'text-cyan-400'
                }`}>
                  {currentUser.role}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('summarix_user');
                  setCurrentUser(null);
                  setSelectedVideo(null);
                  setChapters([]);
                  setSelectedChapter(null);
                  setOverallSummary(null);
                }}
                className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                title="Log Out"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group ${
              showSettings ? 'text-white bg-white/5' : ''
            }`}
            title="Settings"
          >
            <svg className="w-4.5 h-4.5 group-hover:rotate-45 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {showSettings && (
            <>
              {/* Invisible overlay backdrop to close dropdown on click outside */}
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setShowSettings(false)}
              />
              <div className="absolute right-0 top-12 w-48 bg-gray-950/95 border border-white/10 rounded-xl p-3 shadow-2xl flex flex-col gap-2 z-50 animate-fade-in">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">
                  Appearance Settings
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    setShowSettings(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                    theme === 'light'
                      ? 'bg-indigo-500/10 text-indigo-300 font-semibold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Light Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    setShowSettings(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-indigo-500/10 text-indigo-300 font-semibold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  Dark Mode
                </button>
              </div>
            </>
          )}

        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden h-auto lg:h-[calc(100vh-130px)] w-full">
        {!currentUser ? (
          <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />
        ) : !selectedVideo ? (
          <div className="flex-grow flex-1 flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto w-full min-h-0 items-stretch justify-center my-auto">
            {/* Left Column: Catalog */}
            <div className={`flex-1 ${currentUser.role === 'admin' ? 'max-w-xl' : 'max-w-2xl'} w-full glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.05)] border border-white/5 flex flex-col min-h-0`}>
              <h2 className="text-xl font-bold text-center text-white mb-6 font-display flex items-center justify-center gap-2 shrink-0">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Catalog
              </h2>
              <VideosCatalog
                videos={videos}
                playlists={playlists}
                selectedVideo={selectedVideo}
                onSelectVideo={handleSelectVideo}
                onDeleteVideo={handleDeleteVideo}
                onDeletePlaylist={handleDeletePlaylist}
                onUpdateVideoPlaylist={handleUpdateVideoPlaylist}
                isAdmin={currentUser.role === 'admin'}
                fetchPlaylists={fetchPlaylists}
              />
            </div>

            {/* Right Column: Indexer (Admin Only) */}
            {currentUser.role === 'admin' && (
              <div className="flex-grow glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.05)] border border-white/5 flex flex-col min-h-0">
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
                    onIndexStart={() => setIndexingLoading(true)}
                    onIndexSuccess={async (videoId) => {
                      setIndexingLoading(false);
                      setPendingAutoSelectId(videoId);
                      localStorage.setItem('summarix_pending_select', videoId);
                      await fetchVideos();
                      await fetchPlaylists();
                      showSuccess("Video successfully queued for indexing! It will open automatically once summaries are generated.");
                    }}
                    onIndexError={() => setIndexingLoading(false)}
                    onDeleteVideo={handleDeleteVideo}
                    showSuccess={showSuccess}
                    showError={showError}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-grow flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-hidden relative gap-6 lg:gap-0">
            {/* Center Panel (Timeline Explorer) */}
            <main className="flex-grow flex-1 glass-panel p-6 rounded-2xl flex flex-col min-w-0 min-h-0">
              <TimelineExplorer
                key={selectedVideo?.id}
                selectedVideo={selectedVideo}
                chapters={chapters}
                selectedChapter={selectedChapter}
                onSelectChapter={setSelectedChapter}
                isAdmin={currentUser.role === 'admin'}
                onUploadNew={() => {
                  setSelectedVideo(null);
                  setChapters([]);
                  setSelectedChapter(null);
                  setOverallSummary(null);
                }}
              />
            </main>

            {/* Interactive Splitter Divider */}
            <div
              onMouseDown={handleMouseDown}
              className="hidden lg:flex items-center justify-center w-4 cursor-col-resize group select-none relative z-20 hover:scale-x-110 transition-transform"
            >
              {/* Splitter track visual */}
              <div className="w-[1px] h-full bg-white/5 group-hover:bg-indigo-500/30 group-active:bg-indigo-500/50 rounded transition-colors" />
              {/* Grab handle grip */}
              <div className="absolute w-1.5 h-8 bg-white/10 group-hover:bg-indigo-400 group-active:bg-indigo-500 rounded-full border border-white/10 shadow-[0_0_10px_rgba(99,102,241,0.2)] flex flex-col items-center justify-center gap-1 transition-all">
                <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
                <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
                <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
              </div>
            </div>

            {/* Right Sidebar (Summary Console) */}
            <aside className="resizable-right-panel w-full lg:w-auto shrink-0 glass-panel p-5 rounded-2xl flex flex-col min-h-0">
              <SummaryConsole
                selectedChapter={selectedChapter}
                chapters={chapters}
                showSuccess={showSuccess}
                overallSummary={overallSummary}
                overallSummaryLoading={overallSummaryLoading}
                onGenerateOverallSummary={handleGenerateOverallSummary}
              />
            </aside>

            {/* Inline styles to drive the width responsively based on state */}
            <style>{`
              @media (min-width: 1024px) {
                .resizable-right-panel {
                  width: ${rightWidth}px !important;
                }
              }
            `}</style>
          </div>
        )}
      </div>



      {/* Footer */}
      <footer className="border-t border-white/5 bg-gray-950/20 py-3 px-6 text-center text-[10px] text-gray-500">
        © 2026 Summarix Video & Podcast Summary Generator • Powered by Google Gemini and OpenAI Whisper
      </footer>
    </div>
  );
}
