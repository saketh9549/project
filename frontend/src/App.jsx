import React, { useState, useEffect } from 'react';
import StatusAlerts from './components/StatusAlerts';
import VideosCatalog from './components/VideosCatalog';
import VideoIndexer from './components/VideoIndexer';
import TimelineExplorer from './components/TimelineExplorer';
import SummaryConsole from './components/SummaryConsole';

import { apiUrl } from './lib/api';


export default function App() {
  const AUTH_STORAGE_KEY = 'summarix.currentUser';
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);

  // Loading & status states
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [rightWidth, setRightWidth] = useState(350); // width of summary console in px
  const [overallSummary, setOverallSummary] = useState(null);
  const [overallSummaryLoading, setOverallSummaryLoading] = useState(false);





  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = Math.min(650, window.innerWidth * 0.5);
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



  // Fetch videos list on mount
  useEffect(() => {
    fetchVideos();
  }, []);

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


  const fetchVideos = async () => {
    try {
      const response = await fetch(apiUrl('/api/videos'));
      if (!response.ok) throw new Error('Failed to fetch videos');
      const data = await response.json();
      setVideos(data);
    } catch (err) {
      showError('Could not load videos catalog: ' + err.message);
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
    } catch (err) {
      showError('Deletion failed: ' + err.message);
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

  const showError = (msg) => {
    setErrorMsg(msg);
    if (msg) setSuccessMsg(null);
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    if (msg) setErrorMsg(null);
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
            <h1 className="text-xl font-bold font-display bg-gradient-to-r from-black to-gray-400 bg-clip-text text-transparent tracking-tight">
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
          {/* Settings Button */}
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group"
            title="Settings"
          >
            <svg className="w-4.5 h-4.5 group-hover:rotate-45 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden h-auto lg:h-[calc(100vh-130px)] w-full">
        {!selectedVideo ? (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="w-full max-w-xl glass-panel p-8 rounded-2xl shadow-[0_8px_32px_0_rgba(99,102,241,0.05)] border border-white/5 flex flex-col min-h-0">
              <h2 className="text-xl font-bold text-center text-white mb-6 font-display flex items-center justify-center gap-2 shrink-0">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Index New Video File
              </h2>
              <div className="flex-1 overflow-y-auto pr-1">
                <VideoIndexer
                  indexingLoading={indexingLoading}
                  onIndexStart={() => setIndexingLoading(true)}
                  onIndexSuccess={async (videoId) => {
                    setIndexingLoading(false);
                    await fetchVideos();
                    try {
                      const res = await fetch(apiUrl(`/api/videos/${videoId}`));
                      if (res.ok) {
                        const data = await res.json();
                        if (data.video) {
                          setSelectedVideo(data.video);
                          setChapters(data.chapters || []);
                          setOverallSummary(data.video.overall_summary || null);
                        }
                      }
                    } catch (err) {
                      console.error("Failed to select newly indexed video", err);
                    }
                  }}
                  onIndexError={() => setIndexingLoading(false)}
                  showSuccess={showSuccess}
                  showError={showError}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative gap-6 lg:gap-0">
            {/* Left Sidebar (Videos Catalog) */}
            <aside className="w-full lg:w-64 shrink-0 glass-panel p-5 rounded-2xl flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-white font-display uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Videos Catalog
                </h2>
                <button
                  onClick={() => {
                    setSelectedVideo(null);
                    setChapters([]);
                    setSelectedChapter(null);
                    setOverallSummary(null);
                  }}
                  className="text-[9px] bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/50 hover:text-white px-2 py-0.5 rounded-md transition-all cursor-pointer font-semibold"
                  title="Index New Video"
                >
                  + New
                </button>
              </div>
              <VideosCatalog
                videos={videos}
                selectedVideo={selectedVideo}
                onSelectVideo={handleSelectVideo}
                onDeleteVideo={handleDeleteVideo}
              />
            </aside>

            {/* Vertical Divider */}
            <div className="hidden lg:block w-[1px] bg-white/5 mx-3 self-stretch" />

            {/* Center Panel (Timeline Explorer) */}
            <main className="flex-grow flex-1 glass-panel p-6 rounded-2xl flex flex-col min-h-0">
              <TimelineExplorer
                selectedVideo={selectedVideo}
                chapters={chapters}
                selectedChapter={selectedChapter}
                onSelectChapter={setSelectedChapter}
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
        © 2026 Summarix Video Chapter Indexer • Powered by Google Gemini and local audio transcribers
      </footer>
    </div>
  );
}
