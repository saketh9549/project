import React, { useState, useEffect } from 'react';

export default function TimelineExplorer({
  selectedVideo,
  chapters,
  selectedChapter,
  onSelectChapter,
  handleAnalyseVideo,
  analysisLoading
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

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
      const response = await fetch(`/api/search?video_id=${selectedVideo.id}&query=${encodeURIComponent(query)}`);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-lg text-white font-display truncate">
            {selectedVideo.file_name}
          </h3>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-cyan-400">ID:</span> {selectedVideo.id}
            <span className="text-gray-600">•</span>
            <span className="font-semibold text-cyan-400">Duration:</span> {selectedVideo.duration_str}
          </p>
        </div>

        {/* Gemini Analysis Button */}
        <button
          onClick={handleAnalyseVideo}
          disabled={analysisLoading}
          className="shrink-0 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none active:scale-[0.98] text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all shadow-[0_4px_15px_rgba(168,85,247,0.2)] flex items-center justify-center gap-2 cursor-pointer"
        >
          {analysisLoading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Analyzing Topics...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Run Complete Analysis</span>
            </>
          )}
        </button>
      </div>

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
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
        {displayedChapters.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-12">
            {searchQuery.trim()
              ? "No moments match your search query."
              : "No chapters found. Click 'Run Gemini Boundary Analysis' to analyze topic boundaries."}
          </div>
        ) : (
          displayedChapters.map((c) => {
            const isSelected = selectedChapter && selectedChapter.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => onSelectChapter(c)}
                className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer border text-left transition-all ${isSelected
                    ? 'border-cyan-500/50 bg-cyan-950/10 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'border-white/5'
                  }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-cyan-400 tracking-wider">
                    {c.id}
                  </span>
                  <span className="text-xs bg-gray-800/80 border border-white/5 text-gray-300 font-medium px-2 py-0.5 rounded-full font-mono">
                    {c.start_time_str} → {c.end_time_str}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-white mt-2 font-display">
                  {c.topic_title}
                </h4>

                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed line-clamp-3">
                  {highlightText(c.text, searchQuery)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
