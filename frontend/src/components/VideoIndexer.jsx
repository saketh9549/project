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
  
  // Upload states
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploading, setUploading] = useState(false);
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
        onIndexSuccess();
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
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = (file) => {
    setUploading(true);
    setUploadProgress(0);
    showError(null);
    showSuccess(`Uploading '${file.name}' to server uploads folder...`);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(`/api/upload?filename=${encodeURIComponent(file.name)}`), true);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(null);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          setVideoPath(data.file_path);
          showSuccess(`Uploaded successfully! Starting indexing...`);
          // Automatically start indexing!
          runIndexing(data.file_path, language);
        } catch (err) {
          showError("Upload response parsing failed.");
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          showError(`Upload failed: ${data.error || 'Server error'}`);
        } catch (err) {
          showError(`Upload failed with status ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(null);
      showError("Upload network error.");
    };

    xhr.send(file);
  };

  if (uploading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center animate-fade-in h-[350px]">
        {/* Glowing Progress Circle Ring */}
        <div className="relative h-28 w-28 mb-6 flex items-center justify-center">
          {/* Pulsing glow background */}
          <div className="absolute inset-0 rounded-full bg-cyan-500/5 blur-md animate-pulse" />
          
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
              className="stroke-cyan-400 transition-all duration-150 ease-out"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * (uploadProgress || 0)) / 100}
              strokeLinecap="round"
            />
          </svg>
          {/* Centered Percentage Text */}
          <span className="absolute text-xl font-bold font-mono text-white tracking-tighter">
            {uploadProgress || 0}%
          </span>
        </div>

        {/* Progress Text Description */}
        <h3 className="font-bold text-xs text-white font-display uppercase tracking-wider mb-1">
          Uploading media file...
        </h3>
        <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed mx-auto">
          Transferring your file to the server workspace uploads folder.
        </p>

        {/* Horizontal glowing loading bar */}
        <div className="w-full max-w-[180px] bg-gray-900 rounded-full h-1 overflow-hidden mt-6 border border-white/5 mx-auto">
          <div
            className="bg-gradient-to-r from-cyan-500 to-indigo-400 h-1 rounded-full transition-all duration-150"
            style={{ width: `${uploadProgress || 0}%` }}
          />
        </div>
      </div>
    );
  }

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
          disabled={uploading || indexingLoading}
        />
        
        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="text-[11px] text-gray-300">
          <span className="font-semibold text-indigo-400">Click to upload</span> or drag & drop
        </div>
        <div className="text-[9px] text-gray-500 font-mono">Accepts MP4, MP3, WAV, MKV...</div>
      </div>

      {/* Selected target file path display status */}
      {videoPath && (
        <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-lg p-3 text-xs flex flex-col gap-1 select-text">
          <span className="font-semibold text-cyan-400">Target File Path:</span>
          <span className="font-mono break-all text-gray-300">{videoPath}</span>
        </div>
      )}

      {/* Indexing Action Form */}
      <form onSubmit={handleIndexVideo} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400">Language Code (Optional)</label>
          <input
            type="text"
            placeholder="e.g. en, es, auto"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
            disabled={indexingLoading || uploading}
          />
        </div>
        <button
          type="submit"
          disabled={indexingLoading || uploading || !videoPath.trim()}
          className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none text-white font-bold text-xs py-2 rounded-lg transition-all shadow-[0_3px_12px_rgba(99,102,241,0.2)] flex items-center justify-center gap-2 cursor-pointer"
        >
          {indexingLoading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Indexing Audio...</span>
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
            onClick={() => !indexingLoading && !uploading && setLanguage('en')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">English</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">en</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('de')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">German</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">de</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('es')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Spanish</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">es</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('fr')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">French</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">fr</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('it')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Italian</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">it</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('ja')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Japanese</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">ja</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('zh')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Mandarin</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">zh</span>
          </div>
          <div 
            onClick={() => !indexingLoading && !uploading && setLanguage('auto')}
            className="flex justify-between items-center border-b border-white/5 pb-1 hover:border-indigo-500/30 hover:bg-white/5 px-1 py-0.5 rounded transition-all cursor-pointer group"
          >
            <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Auto-Detect</span>
            <span className="text-cyan-400 font-bold bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-500/10">auto</span>
          </div>
        </div>
      </div>
    </div>
  );
}
