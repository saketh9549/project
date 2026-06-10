import React, { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export default function TimelineExplorer({
  selectedVideo,
  chapters,
  selectedChapter,
  onSelectChapter
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const videoRef = React.useRef(null);
  
  const videoSrc = selectedVideo 
    ? apiUrl(`/api/stream-local-video?path=${encodeURIComponent(selectedVideo.absolute_local_path || selectedVideo.file_path || '')}`)
    : '';

  // Reset search state when active video changes
  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, [selectedVideo]);

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!selectedVideo) return;

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/search?video_id=${selectedVideo.id}&query=${encodeURIComponent(query)}`));
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setSearchResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // Helper functions for highlight
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const highlightText = (text, highlight) => {
    if (!highlight || !highlight.trim()) return text;
    const cleanHighlight = highlight.trim();
    const parts = text.split(new RegExp(`(${escapeRegExp(cleanHighlight)})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === cleanHighlight.toLowerCase()
        ? <span key={idx} className="highlight-match">{part}</span>
        : part
    );
  };

  const displayedChapters = searchQuery.trim() ? searchResults : chapters;

  if (!selectedVideo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="h-16 w-16 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold font-display text-white mb-1">
          Select a Video File
        </h3>
        <p className="text-gray-400 max-w-sm text-sm">
          Choose an indexed video from the catalog on the left or use the upload panel to analyze topic moments and read summaries.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Timeline Header Info */}
      <div className="flex flex-col gap-4 border-b border-white/5 pb-4 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-lg text-white font-display truncate">
            {selectedVideo.file_name}
          </h3>
          <p className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-cyan-400">ID:</span> <span className="font-mono">{selectedVideo.id}</span>
            <span className="text-gray-600">•</span>
            <span className="font-semibold text-cyan-400">Duration:</span> {selectedVideo.duration_str}
          </p>
        </div>
      </div>

      {/* Video Player */}
      {videoSrc && (
        <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-black shadow-inner">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            className="w-full max-h-[300px] object-contain"
          />
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search transcript for keywords..."
          value={searchQuery}
          onChange={handleSearch}
          className="w-full bg-gray-900/40 border border-white/5 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-500"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchResults([]); }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chapters List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {displayedChapters.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-12">
            {searchQuery.trim()
              ? "No moments match your search query."
              : "No topic moments found for this video."}
          </div>
        ) : (
          <div className="glass-panel rounded-xl border border-white/5 overflow-hidden flex flex-col divide-y divide-white/5">
            {displayedChapters.map((c, idx) => {
              const isSelected = selectedChapter && selectedChapter.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    onSelectChapter(c);
                    if (videoRef.current) {
                      const seconds = Math.floor(c.start_time);
                      videoRef.current.currentTime = seconds;
                      videoRef.current.play().catch((err) => {
                        console.warn("Autoplay block or interruption on seek:", err);
                      });
                    }
                  }}
                  className={`p-4 cursor-pointer text-left transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/5 border-l-3 ${isSelected
                      ? 'border-cyan-500 bg-cyan-950/10 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
                      : 'border-transparent'
                    }`}
                >
                  <h4 className={`font-bold text-sm font-display transition-colors ${
                    isSelected ? 'text-cyan-400' : 'text-white'
                  }`}>
                    {c.topic_title}
                  </h4>
                  <span className="text-xs bg-gray-800/80 border border-white/5 text-gray-300 font-semibold px-2 py-0.5 rounded-full font-mono shrink-0 select-none">
                    {c.start_time_str} → {c.end_time_str}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
