import React, { useState } from 'react';
import { apiUrl } from '../lib/api';

export default function VideoIndexer({
  indexingLoading,
  onIndexStart,
  onIndexSuccess,
  onIndexError,
  showSuccess,
  showError
}) {
  const [videoPath, setVideoPath] = useState('');
  const [language, setLanguage] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Simulated Indexing progress states
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [indexingStatus, setIndexingStatus] = useState('Initializing...');

  const runIndexing = async (path, lang) => {
    if (!path.trim()) return;
    
    onIndexStart();
    showError(null);
    showSuccess('Indexing video in progress... Please wait. This extracts audio and transcribes it.');
    setIndexingProgress(0);
    setIndexingStatus('Initializing audio extraction...');

    // Start progress simulator
    let currentProgress = 0;
    const interval = setInterval(() => {
      if (currentProgress < 15) {
        currentProgress += 1.5;
        setIndexingStatus('Extracting audio track...');
      } else if (currentProgress < 75) {
        currentProgress += 0.4;
        setIndexingStatus('Transcribing dialogue (Whisper)...');
      } else if (currentProgress < 95) {
        currentProgress += 0.2;
        setIndexingStatus('Analyzing semantic moments (Gemini)...');
      } else if (currentProgress < 98) {
        currentProgress += 0.05;
        setIndexingStatus('Writing index tables...');
      }
      setIndexingProgress(Math.min(98, Math.round(currentProgress)));
    }, 200);
    
    try {
      const response = await fetch(apiUrl('/api/index'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: path.trim(), language: lang.trim() || undefined })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to index video');
      
      // Stop simulator, go to 100%
      clearInterval(interval);
      setIndexingProgress(100);
      setIndexingStatus('Indexing complete!');
      showSuccess(`Successfully indexed video! ID: ${data.video_id}`);
      
      // Wait 1.5 seconds so user sees 100% completion screen
      setTimeout(() => {
        setVideoPath('');
        setLanguage('');
        setIndexingProgress(0);
        onIndexSuccess(data.video_id);
      }, 1500);

    } catch (err) {
      clearInterval(interval);
      setIndexingProgress(0);
      showError('Indexing failed: ' + err.message);
      onIndexError();
    }
  };

  const handleIndexVideo = async (e) => {
    if (e) e.preventDefault();
    runIndexing(videoPath, language);
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const path = file.path || file.name;
      setVideoPath(path);
      showSuccess(`Selected: '${file.name}'. Starting indexing...`);
      runIndexing(path, language);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const path = file.path || file.name;
      setVideoPath(path);
      showSuccess(`Selected: '${file.name}'. Starting indexing...`);
      runIndexing(path, language);
    }
  };

  if (indexingLoading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center animate-fade-in h-[350px]">
        {/* Glowing Progress Circle Ring */}
        <div className="relative h-28 w-28 mb-6 flex items-center justify-center">
          {/* Pulsing glow background */}
          <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-md animate-pulse" />
          
          {/* SVG Progress Ring */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Track Circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className="stroke-white/5"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Indicator Circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className="stroke-indigo-500 transition-all duration-300 ease-out"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * indexingProgress) / 100}
              strokeLinecap="round"
            />
          </svg>
          {/* Centered Percentage Text */}
          <span className="absolute text-xl font-bold font-mono text-white tracking-tighter">
            {indexingProgress}%
          </span>
        </div>

        {/* Progress Text Description */}
        <h3 className="font-bold text-xs text-white font-display uppercase tracking-wider mb-1">
          {indexingStatus}
        </h3>
        <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed mx-auto">
          Running speech-to-text models and Gemini semantic moments.
        </p>

        {/* Horizontal glowing loading bar */}
        <div className="w-full max-w-[180px] bg-gray-900 rounded-full h-1 overflow-hidden mt-6 border border-white/5 mx-auto">
          <div
            className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-1 rounded-full transition-all duration-300"
            style={{ width: `${indexingProgress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-190px)] pr-1">
      {/* Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-picker').click()}
        className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
          dragActive 
            ? 'border-indigo-500 bg-indigo-950/20 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-[1.01]' 
            : 'border-white/10 bg-gray-900/20 hover:border-indigo-500/40 hover:bg-gray-900/40'
        }`}
      >
        <input
          type="file"
          id="file-picker"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={indexingLoading}
        />
        
        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="text-[11px] text-gray-300">
          <span className="font-semibold text-indigo-400">Click to select file</span> or drag & drop
        </div>
        <div className="text-[9px] text-gray-500 font-mono">Selects local reference path</div>
      </div>

      {/* Indexing Action Form */}
      <form onSubmit={handleIndexVideo} className="flex flex-col gap-3">
        {videoPath && (
          <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-lg p-2.5 px-3.5 text-xs flex items-center justify-between select-none animate-fade-in mb-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Selected Video</span>
              <span className="font-mono text-gray-300 truncate text-xs">
                {videoPath.split(/[/\\]/).pop()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVideoPath('')}
              className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xs p-1"
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400">Language Code (Optional)</label>
          <input
            type="text"
            placeholder="e.g. en, es, auto"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
            disabled={indexingLoading}
          />
        </div>
        <button
          type="submit"
          disabled={indexingLoading || !videoPath.trim()}
          className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none text-white font-bold text-xs py-2 rounded-lg transition-all shadow-[0_3px_12px_rgba(99,102,241,0.2)] flex items-center justify-center gap-2 cursor-pointer"
        >
          {indexingLoading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Indexing Video...</span>
            </>
          ) : (
            <span>Index Video</span>
          )}
        </button>
      </form>

      {/* Language Code Legend Guide */}
      <div className="mt-2 bg-gray-950/40 border border-white/5 rounded-xl p-3.5 select-none flex flex-col gap-2">
        <h4 className="text-[10px] font-bold text-gray-400 tracking-wider uppercase flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 11.37 7.31 16.5 3 19" />
          </svg>
          Language Codes
        </h4>
        <p className="text-[9px] text-gray-500 leading-relaxed mb-1">
          Click any code below to automatically prefill the language input field:
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] font-mono">
          <div 
            onClick={() => !indexingLoading && setLanguage('en')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">English</span>
            <span className="lang-badge">en</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('de')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">German</span>
            <span className="lang-badge">de</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('es')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Spanish</span>
            <span className="lang-badge">es</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('fr')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">French</span>
            <span className="lang-badge">fr</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('it')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Italian</span>
            <span className="lang-badge">it</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('ja')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Japanese</span>
            <span className="lang-badge">ja</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('zh')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Mandarin</span>
            <span className="lang-badge">zh</span>
          </div>
          <div 
            onClick={() => !indexingLoading && setLanguage('auto')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Auto-Detect</span>
            <span className="lang-badge">auto</span>
          </div>
        </div>
      </div>
    </div>
  );
}
