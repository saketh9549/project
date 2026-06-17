import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

// New IngestTaskRow component for smooth, self-incrementing progress animation
function IngestTaskRow({ t, onDeleteVideo }) {
  const isUploading = t.status === 'uploading';
  const isQueued = t.status === 'queued';
  const isFailed = t.status === 'failed';
  
  const [localProgress, setLocalProgress] = useState(t.progress);

  useEffect(() => {
    if (isUploading) {
      setLocalProgress(t.progress);
      return;
    }

    if (isFailed) {
      setLocalProgress(0);
      return;
    }

    // Set local progress to at least the backend reported progress
    setLocalProgress(prev => Math.max(prev, t.progress));

    // Determine target cap and speed of increment for the current background status
    let targetCap = 0;
    let increment = 0.1; // progress percentage to add per 100ms tick

    if (isQueued) {
      targetCap = 12;
      increment = 0.05;
    } else if (t.status === 'indexing') {
      targetCap = 15;
      increment = 0.1;
    } else if (t.statusText && t.statusText.includes('Extracting')) {
      targetCap = 44;
      increment = 0.15;
    } else if (t.statusText && t.statusText.includes('Transcribing')) {
      targetCap = 95;
      increment = 0.08;
    } else {
      targetCap = 95;
      increment = 0.1;
    }

    const interval = setInterval(() => {
      setLocalProgress((prev) => {
        if (prev >= targetCap) return prev;
        return Math.min(targetCap, prev + increment);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [t.progress, t.statusText, isUploading, isQueued, isFailed]);

  const displayStatusText = t.statusText && t.statusText.includes('%') && localProgress > 0
    ? t.statusText.replace(/\d+%/, `${Math.round(localProgress)}%`)
    : t.statusText;

  return (
    <div className="flex flex-col gap-1 bg-white/5 p-2 rounded-lg border border-white/5 animate-fade-in">
      <div className="flex items-center justify-between text-[10px] gap-2">
        <span className="text-gray-300 font-semibold truncate max-w-[170px]" title={t.name}>
          {t.name}
        </span>
        <div className="flex items-center gap-1.5 font-mono text-[9px]">
          <span className={
            isFailed ? 'text-red-400' : isQueued ? 'text-blue-400' : 'text-cyan-400'
          }>
            {displayStatusText}
          </span>
          {isFailed && onDeleteVideo && (
            <button
              type="button"
              onClick={(e) => onDeleteVideo(e, t.id)}
              className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer p-0.5"
              title="Remove Failed Upload"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {(isUploading || localProgress > 0) && (
        <div className="w-full bg-gray-900 rounded-full h-1 overflow-hidden border border-white/5">
          <div
            className="bg-cyan-400 h-1 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${localProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function VideoIndexer({
  playlists = [],
  fetchPlaylists,
  onIndexSuccess,
  showSuccess,
  showError,
  videos = [],
  onDeleteVideo
}) {
  const [videoPath, setVideoPath] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  // Tracks active uploads and queue status in the indexer console
  const [tasks, setTasks] = useState([]);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    setCreatingPlaylist(true);
    showError(null);
    try {
      const res = await fetch(apiUrl('/api/playlists'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create folder');

      showSuccess(`Folder "${data.name}" created successfully.`);
      setNewPlaylistName('');

      if (fetchPlaylists) {
        await fetchPlaylists();
      }

      setSelectedPlaylistId(data.id);
    } catch (err) {
      showError('Folder creation failed: ' + err.message);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const uploadFileWithXhr = (file, url, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            resolve({ error: 'Failed to parse server response' });
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.detail || data.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.send(file);
    });
  };

  const runIndexing = async (file, targetPlaylistId) => {
    if (!file) return;

    const taskId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
    const newTask = {
      id: taskId,
      name: file.name,
      status: 'uploading',
      progress: 0,
      statusText: 'Preparing upload...'
    };

    setTasks(prev => [newTask, ...prev]);

    try {
      let path = file.path || '';
      let gridFsId = null;
      let s3Key = null;
      let s3Bucket = null;

      // If we don't have an absolute path (web browser upload), upload first
      if (!path) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: 5, statusText: 'Uploading...' } : t));

        const uploadUrl = apiUrl(`/api/upload?filename=${encodeURIComponent(file.name)}`);
        const uploadData = await uploadFileWithXhr(file, uploadUrl, (percent) => {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: percent, statusText: `Uploading (${percent}%)...` } : t));
        });

        gridFsId = uploadData.grid_fs_id;
        s3Key = uploadData.s3_key;
        s3Bucket = uploadData.s3_bucket;

        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: 100, statusText: 'Queuing...' } : t));
      }

      const response = await fetch(apiUrl('/api/index'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid_fs_id: gridFsId || undefined,
          s3_key: s3Key || undefined,
          s3_bucket: s3Bucket || undefined,
          video_path: path ? path.trim() : undefined,
          file_name: file.name,
          playlist_id: targetPlaylistId && targetPlaylistId !== 'new' ? targetPlaylistId : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Failed to queue indexing');

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'queued', statusText: 'Queued' } : t));
      showSuccess(`Queued "${file.name}" in background!`);

      if (onIndexSuccess) {
        onIndexSuccess(data.video_id);
      }

    } catch (err) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed', statusText: `Failed: ${err.message}` } : t));
      showError(`Indexing failed for "${file.name}": ` + err.message);
    }
  };

  const handleIndexVideo = async (e) => {
    if (e) e.preventDefault();
    if (selectedFiles.length === 0) return;

    const filesToQueue = [...selectedFiles];
    setSelectedFiles([]);
    setVideoPath('');

    filesToQueue.forEach(file => {
      runIndexing(file, selectedPlaylistId);
    });
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...files]);
      setVideoPath(prev => {
        const names = files.map(f => f.name);
        return prev ? `${prev}, ${names.join(', ')}` : names.join(', ');
      });
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
      setVideoPath(prev => {
        const names = files.map(f => f.name);
        return prev ? `${prev}, ${names.join(', ')}` : names.join(', ');
      });
    }
  };

  // Get all processing/failed videos from database
  const dbProcessingVideos = videos.filter(
    (v) => v.upload_status !== 'indexed'
  );

  // Get local tasks that are not yet represented in the database list
  const activeLocalTasks = tasks.filter((t) =>
    t.status === 'uploading' &&
    !dbProcessingVideos.some((dv) => dv.file_name === t.name)
  );

  // Map db videos to the same task structure for rendering in oldest-first order (FIFO)
  const displayTasks = [
    ...[...dbProcessingVideos].reverse().map((v) => {
      const isFailed = v.upload_status === 'failed';
      const isQueued = v.upload_status === 'queued';
      
      let progress = 0;
      if (v.upload_status && v.upload_status.includes('%')) {
        const match = v.upload_status.match(/(\d+)%/);
        if (match) {
          progress = parseInt(match[1], 10);
        }
      } else if (v.upload_status === 'indexing') {
        progress = 50;
      }

      let statusText = 'Processing...';
      if (isFailed) statusText = 'Failed';
      else if (isQueued) statusText = 'Queued';
      else if (v.upload_status === 'indexing') statusText = 'Indexing...';
      else if (v.upload_status) statusText = v.upload_status;

      return {
        id: v.id,
        name: v.file_name,
        status: v.upload_status,
        progress: progress,
        statusText: statusText
      };
    }),
    ...[...activeLocalTasks].reverse()
  ];

  return (
    <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-190px)] pr-1">
      {/* Indexing Action Form */}
      <form onSubmit={handleIndexVideo} className="flex flex-col gap-4">
        {/* Folder (Playlist) Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400">Folder (Playlist)</label>
          <select
            value={selectedPlaylistId}
            onChange={(e) => setSelectedPlaylistId(e.target.value)}
            className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
          >
            <option value="">No Folder (Root Catalog)</option>
            {playlists && playlists.map((pl) => (
              <option key={pl.id} value={pl.id}>{pl.name}</option>
            ))}
            <option value="new">+ Create New Folder...</option>
          </select>
        </div>

        {selectedPlaylistId === 'new' && (
          <div className="flex gap-2 items-center animate-fade-in mb-1">
            <input
              type="text"
              placeholder="New folder name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="flex-grow bg-gray-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
              disabled={creatingPlaylist}
            />
            <button
              type="button"
              onClick={handleCreatePlaylist}
              disabled={creatingPlaylist || !newPlaylistName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {creatingPlaylist ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {/* Drag & Drop Zone - Expanded to fill more space */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-picker').click()}
          className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 min-h-[200px] ${dragActive
              ? 'border-indigo-500 bg-indigo-950/20 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-[1.01]'
              : 'border-white/10 bg-gray-900/20 hover:border-indigo-500/40 hover:bg-gray-900/40'
            }`}
        >
          <input
            type="file"
            id="file-picker"
            accept="audio/*,video/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          <svg className="w-10 h-10 text-indigo-400 transition-transform hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div className="text-xs text-gray-300">
            <span className="font-semibold text-indigo-400">Click to select file</span> or drag & drop video/audio here
          </div>
          <div className="text-[10px] text-gray-500 font-mono">Selects local reference path</div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-lg p-3 text-xs flex flex-col gap-2.5 select-none animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                Selected Files ({selectedFiles.length})
              </span>
              <button
                type="button"
                onClick={() => { setSelectedFiles([]); setVideoPath(''); }}
                className="text-[10px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-1">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white/5 px-2.5 py-1.5 rounded border border-white/5 text-[11px] gap-2">
                  <span className="font-mono text-gray-300 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = selectedFiles.filter((_, i) => i !== idx);
                      setSelectedFiles(updated);
                      setVideoPath(updated.map(f => f.name).join(', '));
                    }}
                    className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xs px-1"
                    title="Remove file"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proceed Button */}
        <button
          type="submit"
          disabled={selectedFiles.length === 0}
          className={`w-full mt-2 font-bold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${selectedFiles.length > 0
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] text-white shadow-[0_3px_12px_rgba(99,102,241,0.2)]'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'
            }`}
        >
          <span>Proceed</span>
        </button>
      </form>

      {/* Task Upload Queue list rendering */}
      {displayTasks.length > 0 && (
        <div className="mt-2 bg-gray-950/40 border border-white/5 rounded-xl p-3.5 select-none flex flex-col gap-2">
          <h4 className="text-[10px] font-bold text-gray-400 tracking-wider uppercase flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Active Ingest Worker Queue
          </h4>
          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
            {displayTasks.map((t) => (
              <IngestTaskRow key={t.id} t={t} onDeleteVideo={onDeleteVideo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
