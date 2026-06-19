import { useState, useEffect, useRef, useMemo } from 'react';
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
  isAdmin,
  currentTime = 0,
  onTimeUpdate
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [ccEnabled, setCcEnabled] = useState(true);
  const [vttUrl, setVttUrl] = useState('');
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [duration, setDuration] = useState(0);

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return '00:00';
    const date = new Date(0);
    date.setSeconds(secs);
    const timeStr = date.toISOString().substr(11, 8);
    if (secs >= 3600) {
      return timeStr;
    }
    return timeStr.substr(3);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(err => console.warn(err));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.warn(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
      setIsFullscreen(false);
    }
  };

  const handleScrubberChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const newPercent = parseFloat(e.target.value);
    const newTime = (newPercent / 100) * (video.duration || 0);
    video.currentTime = newTime;
    if (onTimeUpdate) {
      onTimeUpdate(newTime);
    }
  };

  const handleLoadedMetadata = (e) => {
    setDuration(e.target.duration);
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const parseTranscriptForSubtitles = (rawText) => {
    if (!rawText) return [];
    return rawText.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        const timePart = match[1];
        const text = match[2];
        const times = timePart.split('->').map(t => t.trim());
        if (times.length === 2) {
          const startStr = times[0];
          const endStr = times[1];

          const parseTimeToSeconds = (str) => {
            const parts = str.split(':').map(Number);
            if (parts.length === 3) {
              return parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
              return parts[0] * 60 + parts[1];
            }
            return 0;
          };

          return {
            id: idx,
            start: parseTimeToSeconds(startStr),
            end: parseTimeToSeconds(endStr),
            text
          };
        }
      }
      return null;
    }).filter(Boolean);
  };

  const subtitleCues = useMemo(() => {
    if (selectedVideo?.raw_transcript) {
      return parseTranscriptForSubtitles(selectedVideo.raw_transcript);
    }
    return [];
  }, [selectedVideo]);

  useEffect(() => {
    if (subtitleCues.length === 0) {
      if (vttUrl !== '') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVttUrl('');
      }
      return;
    }

    let vttText = "WEBVTT\n\n";
    subtitleCues.forEach((cue, index) => {
      const formatTime = (seconds) => {
        const date = new Date(0);
        date.setSeconds(seconds);
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        const timeStr = date.toISOString().substr(11, 8);
        return `${timeStr}.${ms}`;
      };

      vttText += `${index + 1}\n`;
      vttText += `${formatTime(cue.start)} --> ${formatTime(cue.end)}\n`;
      vttText += `${cue.text}\n\n`;
    });

    const blob = new Blob([vttText], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    setVttUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [subtitleCues, vttUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    if (tracks && tracks[0]) {
      tracks[0].mode = ccEnabled ? "showing" : "hidden";
    }
  }, [ccEnabled, vttUrl]);

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
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
      {/* Timeline Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4 mb-4 shrink-0">
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
        <div
          ref={containerRef}
          className={`mb-4 rounded-xl overflow-hidden border border-white/10 bg-black shadow-inner shrink-0 relative group ${
            isFullscreen ? 'w-screen h-screen rounded-none border-none' : ''
          }`}
        >
          <video
            ref={videoRef}
            id="main-video-player"
            src={videoSrc}
            crossOrigin="anonymous"
            onClick={togglePlay}
            onTimeUpdate={(e) => {
              if (onTimeUpdate) {
                onTimeUpdate(e.target.currentTime);
              }
            }}
            onEnded={() => {
              if (selectedVideo && selectedVideo.id) {
                const watched = JSON.parse(localStorage.getItem('summarix_watched') || '[]');
                if (!watched.includes(selectedVideo.id)) {
                  watched.push(selectedVideo.id);
                  localStorage.setItem('summarix_watched', JSON.stringify(watched));
                  window.dispatchEvent(new Event('summarix_watched_change'));
                }
              }
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            className={`w-full object-contain cursor-pointer ${
              isFullscreen ? 'h-full max-h-none' : 'max-h-[300px]'
            }`}
          >
            {vttUrl && (
              <track
                label="English"
                kind="subtitles"
                srcLang="en"
                src={vttUrl}
                default={ccEnabled}
              />
            )}
          </video>
          
          {/* Custom Video Controls Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
            {/* Timeline Progress Bar / Scrubber */}
            <div className="flex items-center w-full group/scrubber h-2 relative">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={duration ? (currentTime / duration) * 100 : 0}
                onChange={handleScrubberChange}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:h-1.5 transition-[height] focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
            </div>
            
            {/* Control Buttons row */}
            <div className="flex items-center justify-between text-white text-xs select-none">
              {/* Left Side Controls: Play, Time */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="text-white hover:text-white/80 transition-colors p-1 cursor-pointer"
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                
                <span className="font-mono text-[11px] text-gray-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              
              {/* Right Side Controls: Volume, CC, Fullscreen, More */}
              <div className="flex items-center gap-3.5">
                {/* Volume Button */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-white hover:text-white/80 transition-colors p-1 cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.03a8.99 8.99 0 003.71-1.93L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>
                
                {/* CC Subtitles Button */}
                <button
                  type="button"
                  onClick={() => setCcEnabled(!ccEnabled)}
                  className={`transition-colors p-1 cursor-pointer ${
                    ccEnabled ? 'text-white' : 'text-white/40 hover:text-white'
                  }`}
                  title={ccEnabled ? "Disable Subtitles" : "Enable Subtitles"}
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M19 4H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm-9 7H8.5v-.5h-2v3h2V13H10v1H5.5V9H10v2zm8 0h-1.5v-.5h-2v3h2V13H18v1h-4.5V9H18v2z"/>
                  </svg>
                </button>
                
                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="text-white hover:text-white/80 transition-colors p-1 cursor-pointer"
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                    </svg>
                  )}
                </button>
                
                {/* More Options Button */}
                <button
                  type="button"
                  className="text-white hover:text-white/80 transition-colors p-1 cursor-pointer"
                  title="More Options"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-4 shrink-0">
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
      <div className="flex-none pr-1">
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
                  data-chapter-id-vertical={c.id}
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
                data-chapter-id-horizontal={c.id}
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
                  <span className="text-[10px] font-bold text-cyan-400 font-mono tracking-tighter mb-0.5">
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
