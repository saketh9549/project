import React, { useState } from 'react';

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

  const handleIndexVideo = async (e) => {
    if (e) e.preventDefault();
    if (!videoPath.trim()) return;
    
    onIndexStart();
    showError(null);
    showSuccess('Indexing video in progress... Please wait. This extracts audio and transcribes it.');
    
    try {
      const response = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: videoPath.trim(), language: language.trim() || undefined })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to index video');
      
      showSuccess(`Successfully indexed video! ID: ${data.video_id}`);
      setVideoPath('');
      setLanguage('');
      onIndexSuccess();
    } catch (err) {
      showError('Indexing failed: ' + err.message);
      onIndexError();
    }
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
    xhr.open("POST", `/api/upload?filename=${encodeURIComponent(file.name)}`, true);
    
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
          showSuccess(`Uploaded '${file.name}' successfully! Path pre-filled.`);
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
        
        {uploading ? (
          <div className="w-full flex flex-col items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[10px] text-gray-300 font-semibold">Uploading: {uploadProgress}%</span>
            <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden mt-0.5 border border-white/5">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-1 rounded-full transition-all duration-150" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <>
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="text-[11px] text-gray-300">
              <span className="font-semibold text-indigo-400">Click to upload</span> or drag & drop
            </div>
            <div className="text-[9px] text-gray-500 font-mono">Accepts MP4, MP3, WAV, MKV...</div>
          </>
        )}
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
    </div>
  );
}
