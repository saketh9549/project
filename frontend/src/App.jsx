import React, { useState, useEffect } from 'react';
import StatusAlerts from './components/StatusAlerts';
import VideosCatalog from './components/VideosCatalog';
import VideoIndexer from './components/VideoIndexer';
import TimelineExplorer from './components/TimelineExplorer';
import SummaryConsole from './components/SummaryConsole';

export default function App() {
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

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos');
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
    showSuccess(null);
    showError(null);

    try {
      const response = await fetch(`/api/videos/${video.id}`);
      if (!response.ok) throw new Error('Failed to load video chapters');
      const data = await response.json();
      setChapters(data.chapters || []);
    } catch (err) {
      showError('Could not load video chapters: ' + err.message);
    }
  };

  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this video and all its indexed moments from the database?')) return;

    try {
      const res = await fetch('/api/delete', {
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
      const response = await fetch('/api/analyse', {
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
      <header className="border-b border-white/5 bg-gray-950/40 backdrop-blur-md px-8 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-black text-lg shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            E
          </div>
          <div>
            <h1 className="text-xl font-bold font-display bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight">
              ECHOCHUNK
            </h1>
            <p className="text-xs text-cyan-400 font-semibold tracking-widest uppercase mt-0.5">
              Video & Podcast Summary Generator
            </p>
          </div>
        </div>

        {/* Status Alerts Banners */}
        <StatusAlerts errorMsg={errorMsg} successMsg={successMsg} />
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
              onIndexSuccess={() => {
                setIndexingLoading(false);
                setSidebarTab('catalog'); // Swap back to catalog to show new index!
                fetchVideos();
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
              handleAnalyseVideo={handleAnalyseVideo}
              analysisLoading={analysisLoading}
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
              showSuccess={showSuccess}
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
        © 2026 Echochunk Video Chapter Indexer • Powered by Google Gemini and local audio transcribers
      </footer>
    </div>
  );
}
