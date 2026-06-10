import React, { useState, useEffect } from 'react';
import StatusAlerts from './components/StatusAlerts';
import VideosCatalog from './components/VideosCatalog';
import VideoIndexer from './components/VideoIndexer';
import TimelineExplorer from './components/TimelineExplorer';
import SummaryConsole from './components/SummaryConsole';

import { apiUrl } from './lib/api';


export default function App() {
  const AUTH_STORAGE_KEY = 'summarix.currentUser';
  const [sidebarTab, setSidebarTab] = useState('catalog'); // 'catalog' or 'indexer'
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);

  // Loading & status states
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [leftWidth, setLeftWidth] = useState(320); // width of left sidebar in px
  const [rightWidth, setRightWidth] = useState(350); // width of summary console in px
  const [overallSummary, setOverallSummary] = useState(null);
  const [overallSummaryLoading, setOverallSummaryLoading] = useState(false);



  const handleLeftMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = Math.min(500, window.innerWidth * 0.4);
      const newWidth = Math.max(260, Math.min(maxW, startWidth + deltaX));
      setLeftWidth(newWidth);
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

  const handleAnalyseVideo = async () => {
    if (!selectedVideo) return;

    setAnalysisLoading(true);
    showError(null);
    showSuccess('Analyzing boundaries with Gemini... Please wait.');

    try {
      const response = await fetch(apiUrl('/api/analyse'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: selectedVideo.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to analyze video');

      showSuccess('Gemini boundary analysis completed!');
      await handleSelectVideo(selectedVideo);
    } catch (err) {
      showError('Analysis failed: ' + err.message);
    } finally {
      setAnalysisLoading(false);
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
      <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-0 p-6 overflow-hidden h-auto lg:h-[calc(100vh-130px)] w-full">

        {/* Left Sidebar (Catalog & Upload tabs) */}
        <aside className="resizable-left-panel w-full lg:w-auto shrink-0 glass-panel p-5 rounded-2xl flex flex-col min-h-0">
          {/* Tab Selector */}
          <div className="flex border-b border-white/5 mb-4 shrink-0">
            <button
              onClick={() => setSidebarTab('catalog')}
              type="button"
              className={`flex-1 text-center font-bold font-display py-2 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${sidebarTab === 'catalog'
                ? 'text-indigo-400 border-indigo-500 shadow-[inset_0_-2px_0_0_rgb(99,102,241)]'
                : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
            >
              CATALOG
            </button>
            <button
              onClick={() => setSidebarTab('indexer')}
              type="button"
              className={`flex-1 text-center font-bold font-display py-2 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${sidebarTab === 'indexer'
                ? 'text-indigo-400 border-indigo-500 shadow-[inset_0_-2px_0_0_rgb(99,102,241)]'
                : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
            >
              UPLOAD
            </button>
          </div>

          {/* Conditional Tab Rendering */}
          {sidebarTab === 'catalog' ? (
            <VideosCatalog
              videos={videos}
              selectedVideo={selectedVideo}
              onSelectVideo={handleSelectVideo}
              onDeleteVideo={handleDeleteVideo}
            />
          ) : (
            <VideoIndexer
              indexingLoading={indexingLoading}
              onIndexStart={() => setIndexingLoading(true)}
              onIndexSuccess={async (videoId) => {
                setIndexingLoading(false);
                setSidebarTab('catalog'); // Swap back to catalog to show new index!
                await fetchVideos();
                if (videoId) {
                  try {
                    const response = await fetch(apiUrl(`/api/videos/${videoId}`));
                    if (response.ok) {
                      const data = await response.json();
                      if (data.video) {
                        handleSelectVideo(data.video);
                      }
                    }
                  } catch (err) {
                    console.error('Auto-selecting new video failed:', err);
                  }
                }
              }}
              onIndexError={() => setIndexingLoading(false)}
              showSuccess={showSuccess}
              showError={showError}
            />
          )}
        </aside>

        {/* Left Splitter Divider */}
        <div
          onMouseDown={handleLeftMouseDown}
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

        {/* Workspace containing Center Panel and Right Sidebar */}
        <div className="flex-grow flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative gap-6 lg:gap-0">

          {/* Center Panel (Timeline Explorer) */}
          <main className="flex-grow flex-1 glass-panel p-6 rounded-2xl flex flex-col min-h-0">
            <TimelineExplorer
              selectedVideo={selectedVideo}
              chapters={chapters}
              selectedChapter={selectedChapter}
              onSelectChapter={setSelectedChapter}
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
              .resizable-left-panel {
                width: ${leftWidth}px !important;
              }
              .resizable-right-panel {
                width: ${rightWidth}px !important;
              }
            }
          `}</style>
        </div>
      </div>



      {/* Footer */}
      <footer className="border-t border-white/5 bg-gray-950/20 py-3 px-6 text-center text-[10px] text-gray-500">
        © 2026 Summarix Video Chapter Indexer • Powered by Google Gemini and local audio transcribers
      </footer>
    </div>
  );
}
