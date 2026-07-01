import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import StatusAlerts from './components/StatusAlerts';
import AuthPage from './components/AuthPage';

// Import new views
import Home from './components/Home';
import CatalogPage from './components/CatalogPage';
import VideoWorkspace from './components/VideoWorkspace';
import QuizPage from './components/QuizPage';
import QuizAnalytics from './components/QuizAnalytics';
import ChangePasswordPage from './components/ChangePasswordPage';
import CourseSyllabusPage from './components/CourseSyllabusPage';

import { apiUrl } from './lib/api';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

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
  const [pendingAutoSelectId, setPendingAutoSelectId] = useState(() => {
    return localStorage.getItem('summarix_pending_select') || null;
  });

  // Appearance / Theme states
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('summarix_theme') || 'light';
  });
  const [showSettings, setShowSettings] = useState(false);

  // Loading & status states
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Sidebar navigation collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('summarix_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('summarix_sidebar_collapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

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
      const email = currentUser.email || 'anonymous@summarix.io';
      const role = currentUser.role || 'user';
      const response = await fetch(apiUrl(`/api/videos?owner_email=${encodeURIComponent(email)}&role=${role}`));
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
      const email = currentUser.email || 'anonymous@summarix.io';
      const role = currentUser.role || 'user';
      const response = await fetch(apiUrl(`/api/playlists?owner_email=${encodeURIComponent(email)}&role=${role}`));
      if (!response.ok) throw new Error('Failed to fetch playlists');
      const data = await response.json();
      setPlaylists(data);
    } catch (err) {
      showError('Could not load playlists: ' + err.message);
    }
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
    fetchVideos();
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Polling for processing/indexing videos
  useEffect(() => {
    const hasProcessingVideos = videos.some(
      (v) => v.upload_status !== 'indexed' && v.upload_status !== 'failed' && !v.upload_status.startsWith('failed_')
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
    if (!pendingId) return;

    // Clear state if the user has already navigated to the target video workspace
    if (location.pathname === `/video/${pendingId}`) {
      setPendingAutoSelectId(null);
      localStorage.removeItem('summarix_pending_select');
      return;
    }

    if (videos.length === 0) return;

    const matchedVideo = videos.find((v) => v.id === pendingId);
    if (matchedVideo && matchedVideo.upload_status === 'indexed') {
      const timer = setTimeout(() => {
        setPendingAutoSelectId(null);
        localStorage.removeItem('summarix_pending_select');
        showSuccess(`Video "${matchedVideo.file_name}" has finished indexing and is ready!`);
        navigate(`/video/${matchedVideo.id}`, { state: { from: '/catalog' } });
      }, 1000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, pendingAutoSelectId, location.pathname]);

  // Auto-dismiss success and error notifications after 2.5 seconds
  useEffect(() => {
    if (errorMsg || successMsg) {
      const isProgress = (successMsg && (successMsg.includes('Please wait') || successMsg.includes('Uploading')));
      if (isProgress) return;

      const timer = setTimeout(() => {
        setErrorMsg(null);
        setSuccessMsg(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, successMsg]);

  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    const video = videos.find(v => v.id === videoId);
    const isProcessing = video && video.upload_status !== 'indexed';
    const confirmMessage = isProcessing
      ? 'Are you sure you want to stop processing and delete this video?'
      : 'Are you sure you want to delete this video and all its indexed moments from the database?';
    if (!confirm(confirmMessage)) return;

    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const res = await fetch(apiUrl(`/api/delete?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete video');

      showSuccess('Video deleted successfully.');
      if (location.pathname === `/video/${videoId}` || location.pathname === `/quiz/${videoId}`) {
        navigate('/catalog');
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
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const res = await fetch(apiUrl(`/api/playlists/${playlistId}?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to delete folder');

      showSuccess('Folder deleted successfully.');
      await fetchPlaylists();
      await fetchVideos();
    } catch (err) {
      showError('Deletion failed: ' + err.message);
    }
  };

  const handleUpdateVideoPlaylist = async (videoId, playlistId) => {
    if (!currentUser) return;
    try {
      const email = currentUser.email || 'anonymous@summarix.io';
      const role = currentUser.role || 'user';
      const response = await fetch(apiUrl(`/api/videos/${videoId}/playlist?owner_email=${encodeURIComponent(email)}&role=${role}`), {
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

  if (!currentUser) {
    return <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  // Navigation menu highlights
  // Navigation menu highlights
  const activeFrom = location.state?.originalFrom || location.state?.from || '';
  const isHomeActive = location.pathname === '/home' || (location.pathname.startsWith('/course') && location.state?.from === '/home') || (location.pathname.startsWith('/video') && (location.state?.from === '/home' || activeFrom === '/home')) || (location.pathname.startsWith('/quiz') && (location.state?.from === '/home' || activeFrom === '/home') && !location.pathname.startsWith('/quiz-analytics'));
  const isWorkspaceActive = location.pathname === '/my-workspace' || (location.pathname.startsWith('/course') && location.state?.from === '/my-workspace') || (location.pathname.startsWith('/video') && (location.state?.from === '/my-workspace' || activeFrom === '/my-workspace')) || (location.pathname.startsWith('/quiz') && (location.state?.from === '/my-workspace' || activeFrom === '/my-workspace') && !location.pathname.startsWith('/quiz-analytics'));
  const isCatalogActive = location.pathname === '/catalog' || (location.pathname.startsWith('/course') && location.state?.from === '/catalog') || (location.pathname.startsWith('/video') && (location.state?.from === '/catalog' || activeFrom === '/catalog' || !location.state?.from)) || (location.pathname.startsWith('/quiz') && (location.state?.from === '/catalog' || activeFrom === '/catalog' || !location.state?.from) && !location.pathname.startsWith('/quiz-analytics'));
  const isAnalyticsActive = location.pathname === '/quiz-analytics';
  const isSettingsActive = location.pathname === '/change-password';
  const isWorkspace = location.pathname.startsWith('/video');

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b border-white/5 bg-gray-950/40 backdrop-blur-md px-8 py-3 flex items-center justify-between sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-6 shrink-0">
          {/* Logo brand */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => navigate('/home')}>
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
              <h1 className="text-xl font-bold font-display text-black dark:text-white tracking-tight logo-text">
                Summarix
              </h1>
              <p className="text-xs text-cyan-400 font-semibold tracking-widest uppercase mt-0.5">
                Video & Podcast Summary Generator
              </p>
            </div>
          </div>

          {/* Navigation tabs removed - replaced by Sidebar */}
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
                <span className={`text-[9px] font-bold uppercase tracking-wider ${currentUser.role === 'admin' ? 'text-indigo-400' : 'text-cyan-400'
                  }`}>
                  {currentUser.role}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('summarix_user');
                  setCurrentUser(null);
                  navigate('/home');
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
            className={`p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group ${showSettings ? 'text-white bg-white/5' : ''
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
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${theme === 'light'
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
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${theme === 'dark'
                    ? 'bg-indigo-500/10 text-indigo-300 font-semibold'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  Dark Mode
                </button>
                <div className="border-t border-white/5 my-1" />
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">
                  Account Settings
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    navigate('/change-password');
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Change Password
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Container holding Sidebar and Content */}
      <div className="flex-grow flex-1 flex flex-row min-h-0 w-full overflow-hidden">
        {/* Sidebar Navigation */}
        {currentUser?.role === 'admin' && (
          <aside className={`border-r border-white/5 bg-gray-950/40 backdrop-blur-md flex flex-col shrink-0 select-none glass-panel justify-between transition-all duration-300 ${sidebarCollapsed ? 'w-20 pt-3 px-3 pb-1.5' : 'w-64 pt-5 px-5 pb-2.5'
            }`}>
            <div className="flex flex-col gap-2">
              <div className={`flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2 ${sidebarCollapsed ? 'justify-center px-0' : ''}`}>
                {!sidebarCollapsed && <span>Navigation</span>}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className={`p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer ${sidebarCollapsed ? 'w-full flex justify-center' : ''}`}
                  title={sidebarCollapsed ? "Expand Navigation" : "Collapse Navigation"}
                >
                  {sidebarCollapsed ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  )}
                </button>
              </div>
              <Link
                to="/home"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent cursor-pointer group ${sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${isHomeActive
                    ? 'nav-link-active font-bold shadow-[0_0_8px_rgba(34,211,238,0.06)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? "Dashboard" : undefined}
              >
                <svg className="w-4 h-4 transition-transform group-hover:scale-110 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                </svg>
                {!sidebarCollapsed && <span>Dashboard</span>}
              </Link>
              <Link
                to="/my-workspace"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent cursor-pointer group ${sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${isWorkspaceActive
                    ? 'nav-link-active font-bold shadow-[0_0_8px_rgba(34,211,238,0.06)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? "My Workspace" : undefined}
              >
                <svg className="w-4 h-4 transition-transform group-hover:scale-110 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {!sidebarCollapsed && <span>My Workspace</span>}
              </Link>
              <Link
                to="/catalog"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent cursor-pointer group ${sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${isCatalogActive
                    ? 'nav-link-active font-bold shadow-[0_0_8px_rgba(34,211,238,0.06)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? "Upload" : undefined}
              >
                <svg className="w-4 h-4 transition-transform group-hover:scale-110 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {!sidebarCollapsed && <span>Upload</span>}
              </Link>
              <Link
                to="/quiz-analytics"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent cursor-pointer group ${sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${isAnalyticsActive
                    ? 'nav-link-active font-bold shadow-[0_0_8px_rgba(34,211,238,0.06)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? "Quiz Analytics" : undefined}
              >
                <svg className="w-4 h-4 transition-transform group-hover:scale-110 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
                </svg>
                {!sidebarCollapsed && <span>Quiz Analytics</span>}
              </Link>
            </div>

            {/* Settings Tab at the bottom */}
            <div className="mt-auto pt-2 border-t border-white/5">
              <Link
                to="/change-password"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent cursor-pointer group ${sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${isSettingsActive
                    ? 'nav-link-active font-bold shadow-[0_0_8px_rgba(34,211,238,0.06)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? "Settings" : undefined}
              >
                <svg className="w-4 h-4 transition-transform group-hover:scale-110 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!sidebarCollapsed && <span>Settings</span>}
              </Link>
            </div>

          </aside>
        )}

        {/* Content Area */}
        <div className={`flex-grow flex-1 flex flex-col p-6 min-h-0 ${isWorkspace ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <Routes>
            <Route path="/home" element={
              <Home
                currentUser={currentUser}
                videos={videos}
                playlists={playlists}
                fetchPlaylists={fetchPlaylists}
                indexingLoading={indexingLoading}
                pendingAutoSelectId={pendingAutoSelectId}
                onIndexStart={() => setIndexingLoading(true)}
                onIndexSuccess={async (videoId) => {
                  setIndexingLoading(false);
                  setPendingAutoSelectId(videoId);
                  localStorage.setItem('summarix_pending_select', videoId);
                  await fetchVideos();
                  await fetchPlaylists();
                  showSuccess("Video successfully queued for indexing! Redirecting to workspace upon completion.");
                }}
                onIndexError={() => setIndexingLoading(false)}
                onDeleteVideo={handleDeleteVideo}
                showSuccess={showSuccess}
                showError={showError}
              />
            } />
            <Route path="/my-workspace" element={
              <Home
                currentUser={currentUser}
                videos={videos}
                playlists={playlists}
                fetchPlaylists={fetchPlaylists}
                indexingLoading={indexingLoading}
                pendingAutoSelectId={pendingAutoSelectId}
                onIndexStart={() => setIndexingLoading(true)}
                onIndexSuccess={async (videoId) => {
                  setIndexingLoading(false);
                  setPendingAutoSelectId(videoId);
                  localStorage.setItem('summarix_pending_select', videoId);
                  await fetchVideos();
                  await fetchPlaylists();
                  showSuccess("Video successfully queued for indexing! Redirecting to workspace upon completion.");
                }}
                onIndexError={() => setIndexingLoading(false)}
                onDeleteVideo={handleDeleteVideo}
                showSuccess={showSuccess}
                showError={showError}
                myWorkspaceMode={true}
              />
            } />
            <Route path="/course/:playlistId" element={
              <CourseSyllabusPage
                videos={videos}
                playlists={playlists}
                currentUser={currentUser}
              />
            } />
            <Route path="/catalog" element={
              currentUser?.role === 'admin' ? (
                <CatalogPage
                  videos={videos}
                  playlists={playlists}
                  onDeleteVideo={handleDeleteVideo}
                  onDeletePlaylist={handleDeletePlaylist}
                  onUpdateVideoPlaylist={handleUpdateVideoPlaylist}
                  currentUser={currentUser}
                  fetchPlaylists={fetchPlaylists}
                  fetchVideos={fetchVideos}
                  indexingLoading={indexingLoading}
                  pendingAutoSelectId={pendingAutoSelectId}
                  onIndexStart={() => setIndexingLoading(true)}
                  onIndexSuccess={async (videoId) => {
                    setIndexingLoading(false);
                    setPendingAutoSelectId(videoId);
                    localStorage.setItem('summarix_pending_select', videoId);
                    await fetchVideos();
                    await fetchPlaylists();
                    showSuccess("Video successfully queued for indexing! Redirecting to workspace upon completion.");
                  }}
                  onIndexError={() => setIndexingLoading(false)}
                  showSuccess={showSuccess}
                  showError={showError}
                />
              ) : (
                <Navigate to="/home" replace />
              )
            } />
            <Route path="/quiz-analytics" element={
              currentUser?.role === 'admin' ? (
                <QuizAnalytics
                  currentUser={currentUser}
                  showSuccess={showSuccess}
                  showError={showError}
                />
              ) : (
                <Navigate to="/home" replace />
              )
            } />
            <Route path="/video/:id" element={
              <VideoWorkspace
                currentUser={currentUser}
                showSuccess={showSuccess}
                showError={showError}
              />
            } />
            <Route path="/quiz/:id" element={
              <QuizPage
                currentUser={currentUser}
                showSuccess={showSuccess}
                showError={showError}
                playlists={playlists}
              />
            } />
            <Route path="/quiz/:id/:mode" element={
              <QuizPage
                currentUser={currentUser}
                showSuccess={showSuccess}
                showError={showError}
                playlists={playlists}
              />
            } />

            <Route path="/change-password" element={
              currentUser ? (
                <ChangePasswordPage
                  currentUser={currentUser}
                  showSuccess={showSuccess}
                  showError={showError}
                />
              ) : (
                <Navigate to="/" replace />
              )
            } />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-gray-950/20 py-3 px-6 text-center text-[10px] text-gray-500">
        © 2026 Summarix Video & Podcast Summary Generator • Powered by Google Gemini and OpenAI Whisper
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
