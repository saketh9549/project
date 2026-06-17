import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../lib/api';

function ChapterThumbnail({ videoSrc, time }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prevProps, setPrevProps] = useState({ videoSrc, time });

  if (prevProps.videoSrc !== videoSrc || prevProps.time !== time) {
    setPrevProps({ videoSrc, time });
    setLoading(true);
    setThumbnail(null);
  }

  useEffect(() => {
    if (!videoSrc || time === undefined) return;

    let active = true;

    const video = document.createElement('video');
    video.src = videoSrc;
    video.crossOrigin = 'anonymous';
    video.currentTime = time;
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, 5000);

    video.onseeked = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setThumbnail(dataUrl);
        setLoading(false);
      } catch (err) {
        console.warn("Frame capture failed:", err);
        setLoading(false);
      }
    };

    video.onerror = () => {
      if (active) setLoading(false);
    };

    return () => {
      active = false;
      clearTimeout(timeout);
      video.src = '';
      video.load();
    };
  }, [videoSrc, time]);

  if (loading) {
    return (
      <div className="w-36 h-20 bg-gray-200/50 dark:bg-gray-800/50 rounded-lg animate-pulse flex items-center justify-center border border-white/5">
        <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!thumbnail) {
    return (
      <div className="w-36 h-20 bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center border border-indigo-500/20 relative">
        <svg className="w-6 h-6 text-indigo-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={thumbnail}
      alt="Chapter Preview"
      className="w-36 h-20 object-cover rounded-lg border border-white/10 shadow-sm transition-transform duration-300 group-hover:scale-105"
    />
  );
}

export default function TimelineExplorer({
  selectedVideo,
  chapters,
  selectedChapter,
  onSelectChapter,
  onUploadNew,
  isAdmin
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const videoRef = useRef(null);

  const videoSrc = selectedVideo
    ? apiUrl(`/api/stream-local-video?video_id=${encodeURIComponent(selectedVideo.id)}`)
    : '';

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onUploadNew}
            className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group shrink-0"
            title="Go back to Catalog / Upload"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-white font-display truncate">
              {selectedVideo.file_name}
            </h3>
            <p className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-cyan-400">Duration:</span> {selectedVideo.duration_str}
            </p>
          </div>
        </div>
        {isAdmin ? (
          <button
            onClick={onUploadNew}
            className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white active:scale-[0.98] font-semibold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Upload New
          </button>
        ) : (
          <button
            onClick={onUploadNew}
            className="shrink-0 flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-white active:scale-[0.98] font-semibold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer border border-white/5 shadow-md"
          >
            Catalog
          </button>
        )}
      </div>

      {/* Video Player */}
      {videoSrc && (
        <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-black shadow-inner">
          <video
            ref={videoRef}
            id="main-video-player"
            src={videoSrc}
            controls
            crossOrigin="anonymous"
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
            {displayedChapters.map((c) => {
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
                      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`p-4 cursor-pointer text-left transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-white/5 border-l-3 ${isSelected
                    ? 'border-cyan-500 bg-cyan-950/10 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
                    : 'border-transparent'
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-sm font-display transition-colors ${isSelected ? 'text-cyan-400' : 'text-white'
                      }`}>
                      {highlightText(c.topic_title, searchQuery)}
                    </h4>
                    {searchQuery && c.text && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {highlightText(c.text, searchQuery)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs bg-gray-800/80 border border-white/5 text-gray-300 font-semibold px-2 py-0.5 rounded-full font-mono shrink-0 select-none mt-0.5">
                    {c.start_time_str} → {c.end_time_str}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Horizontal Chapters Timeline */}
      <div className="mt-6 border-t border-white/5 pt-5 shrink-0 select-none">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-xs font-bold font-display uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Chapters
          </h3>
          <span className="text-[10px] text-gray-500 font-semibold cursor-default hover:text-indigo-400 transition-colors uppercase tracking-wider">

          </span>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
          {chapters.map((c) => {
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
                    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className={`flex-none w-36 group cursor-pointer transition-all ${isSelected ? 'scale-[0.98]' : ''
                  }`}
              >
                <div className="relative overflow-hidden rounded-lg mb-2">
                  <ChapterThumbnail videoSrc={videoSrc} time={c.start_time} />
                  {isSelected && (
                    <div className="absolute inset-0 bg-cyan-500/10 border-2 border-cyan-500 rounded-lg flex items-center justify-center">
                      <div className="bg-cyan-500 text-black p-1 rounded-full shadow-lg">
                        <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 px-1">
                  <span className="text-[10px] font-bold text-cyan-400 font-mono tracking-tighter">
                    {c.start_time_str}
                  </span>
                  <p className={`text-[11px] font-semibold font-display leading-snug line-clamp-2 transition-colors ${isSelected ? 'text-cyan-400' : 'text-white'
                    }`}>
                    {c.topic_title}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
