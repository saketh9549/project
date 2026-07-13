import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';
import VideoIndexer from './VideoIndexer';

export default function VideosCatalog({
  videos,
  playlists = [],
  selectedVideo,
  onSelectVideo,
  onDeleteVideo,
  onDeletePlaylist,
  onUpdateVideoPlaylist,
  isAdmin,
  fetchPlaylists,
  fetchVideos,
  indexingLoading,
  pendingAutoSelectId,
  onIndexStart,
  onIndexSuccess,
  onIndexError,
  showSuccess,
  showError,
  initialOpenUpload = false,
  initialPlaylistId = '',
  currentUser
}) {
  const [expandedPlaylists, setExpandedPlaylists] = useState({});
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [activeMenuVideoId, setActiveMenuVideoId] = useState(null);
  
  const handleReorder = async (v, direction) => {
    const folderVids = videos
      .filter((item) => item.playlist_id === v.playlist_id && item.upload_status === 'indexed');
    
    const idx = folderVids.findIndex((item) => item.id === v.id);
    if (idx === -1) return;

    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === folderVids.length - 1) return;

    const newOrderedVids = [...folderVids];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    const temp = newOrderedVids[idx];
    newOrderedVids[idx] = newOrderedVids[targetIdx];
    newOrderedVids[targetIdx] = temp;

    const orderedIds = newOrderedVids.map(item => item.id);

    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const response = await fetch(apiUrl(`/api/videos/reorder?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: v.playlist_id,
          video_ids: orderedIds
        })
      });
      if (!response.ok) {
        throw new Error('Failed to reorder playlist videos');
      }
      showSuccess('Playlist order updated!');
      if (fetchVideos) {
        await fetchVideos();
      }
    } catch (err) {
      showError(err.message);
    }
  };
  
  // Tabbed administration layout states
  const [activeTab, setActiveTab] = useState(initialOpenUpload ? 'upload' : 'library');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync tab if initialOpenUpload prop changes
  useEffect(() => {
    if (initialOpenUpload) {
      setActiveTab('upload');
    }
  }, [initialOpenUpload]);

  const togglePlaylist = (plId) => {
    setExpandedPlaylists((prev) => ({
      ...prev,
      [plId]: !prev[plId]
    }));
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const res = await fetch(apiUrl(`/api/playlists?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create folder');

      setNewFolderName('');
      setShowNewFolderForm(false);
      showSuccess(`Created folder "${data.name || newFolderName}"!`);
      if (fetchPlaylists) {
        await fetchPlaylists();
      }
    } catch (err) {
      showError('Failed to create folder: ' + err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  // Group videos by playlist_id
  const playlistsMap = {};
  playlists.forEach((pl) => {
    playlistsMap[pl.id] = { ...pl, videos: [] };
  });

  const standaloneVideos = [];
  videos.forEach((v) => {
    // Only show fully indexed videos in the catalog list
    if (v.upload_status !== 'indexed') return;

    // Apply search query filter
    const matchesSearch = !searchQuery || v.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (searchQuery && !matchesSearch) return;

    if (v.playlist_id && playlistsMap[v.playlist_id]) {
      playlistsMap[v.playlist_id].videos.push(v);
    } else {
      standaloneVideos.push(v);
    }
  });

  // Filter playlists/folders based on search query
  const filteredPlaylists = playlists.filter((pl) => {
    if (!searchQuery) return true;
    const nameMatches = pl.name.toLowerCase().includes(searchQuery.toLowerCase());
    const folderVideos = playlistsMap[pl.id]?.videos || [];
    const hasMatchingVideo = folderVideos.some(v => v.file_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return nameMatches || hasMatchingVideo;
  });

  const renderVideoItem = (v, indent = false, isFirst = false, isLast = false) => {
    const isSelected = selectedVideo && selectedVideo.id === v.id;
    const isProcessing = v.upload_status && v.upload_status !== 'indexed';
    const isFailed = v.upload_status === 'failed' || (v.upload_status && v.upload_status.startsWith('failed_'));
    const isMenuOpen = activeMenuVideoId === v.id;

    const handleClick = () => {
      if (isProcessing) return;
      onSelectVideo(v);
    };

    return (
      <div
        key={v.id}
        onClick={handleClick}
        className={`glass-panel p-3 rounded-xl flex items-start justify-between gap-3 border transition-all select-none ${
          isSelected
            ? 'border-indigo-500/50 bg-indigo-950/20 shadow-[0_0_10px_rgba(99,102,241,0.08)]'
            : 'border-white/5'
        } ${indent ? 'ml-6' : ''} ${
          isProcessing 
            ? 'opacity-65 cursor-not-allowed' 
            : 'glass-panel-hover cursor-pointer'
        } ${isMenuOpen ? 'relative z-30' : 'relative z-0'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isProcessing && !isFailed && (
              <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <p className="font-semibold text-xs text-gray-200 truncate">
              {v.file_name}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
            {isProcessing ? (
              isFailed ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                  Failed
                </span>
              ) : v.upload_status === 'queued' ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono animate-pulse">
                  Queued
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono animate-pulse">
                  Indexing...
                </span>
              )
            ) : (
              <span className="flex items-center gap-1 font-mono">
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {v.duration_str}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0 relative">
            {v.playlist_id && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReorder(v, 'up');
                  }}
                  disabled={isFirst}
                  className="text-gray-500 hover:text-indigo-400 p-0.5 rounded transition-colors cursor-pointer shrink-0 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-gray-500"
                  title="Move Up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReorder(v, 'down');
                  }}
                  disabled={isLast}
                  className="text-gray-500 hover:text-indigo-400 p-0.5 rounded transition-colors cursor-pointer shrink-0 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-gray-500"
                  title="Move Down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuVideoId(activeMenuVideoId === v.id ? null : v.id);
              }}
              className="text-gray-500 hover:text-indigo-400 p-0.5 rounded transition-colors cursor-pointer shrink-0"
              title="Move Video"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-8L8 4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3" />
              </svg>
            </button>

            <button
              onClick={(e) => onDeleteVideo(e, v.id)}
              className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer shrink-0"
              title="Delete Video"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            {activeMenuVideoId === v.id && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuVideoId(null);
                  }}
                />
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-gray-950/95 border border-white/10 rounded-xl shadow-2xl z-50 p-1.5 backdrop-blur-md animate-fade-in">
                  <div className="px-2.5 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Move Video To:</div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setActiveMenuVideoId(null);
                      await onUpdateVideoPlaylist(v.id, null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/5 text-gray-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Root (Standalone)
                  </button>
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setActiveMenuVideoId(null);
                        await onUpdateVideoPlaylist(v.id, pl.id);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/5 text-gray-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      {pl.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Glassmorphic Pill Tabs (Admin Switcher) */}
      {isAdmin && (
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 self-center mb-6 shrink-0 relative shadow-inner animate-fade-in select-none">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 cursor-pointer ${
              activeTab === 'library'
                ? 'bg-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] scale-[1.01]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Library Catalog
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] scale-[1.01]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload & Index
          </button>
        </div>
      )}

      {/* Tab 1: Library Catalog */}
      {activeTab === 'library' && (
        <div className="flex flex-col gap-4 flex-grow min-h-0 animate-fade-in">
          {/* Library controls header */}
          {isAdmin && (
            <div className="flex items-center justify-between gap-3 shrink-0">
              {/* Search Input */}
              <div className="relative flex-grow max-w-sm">
                <input
                  type="text"
                  placeholder="Search folders or videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/40 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Create Folder button */}
              {!showNewFolderForm && (
                <button
                  type="button"
                  onClick={() => setShowNewFolderForm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  New Folder
                </button>
              )}
            </div>
          )}

          {/* New folder creation form inline */}
          {showNewFolderForm && (
            <form onSubmit={handleCreateFolder} className="flex gap-2 items-center animate-fade-in bg-white/5 p-3 rounded-xl border border-white/5 shrink-0">
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex-grow bg-gray-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
                disabled={creatingFolder}
                autoFocus
              />
              <button
                type="submit"
                disabled={creatingFolder || !newFolderName.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNewFolderForm(false); setNewFolderName(''); }}
                className="text-gray-400 hover:text-white text-xs px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}

          {/* Catalog items list */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0">
            {filteredPlaylists.length === 0 && standaloneVideos.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-12 font-mono border border-dashed border-white/5 rounded-2xl">
                {searchQuery ? 'No matching folders or videos found.' : 'No items in catalog.'}
              </div>
            ) : (
              <>
                {/* Render Playlists/Folders */}
                {filteredPlaylists.map((pl) => {
                  const isExpanded = !!expandedPlaylists[pl.id];
                  const folderVideos = playlistsMap[pl.id]?.videos || [];

                  return (
                    <div 
                      key={pl.id} 
                      className="flex flex-col gap-1 border border-white/5 bg-white/5 rounded-xl p-2 transition-all"
                    >
                      <div
                        onClick={() => togglePlaylist(pl.id)}
                        className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? (
                            <svg className="w-4.5 h-4.5 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                            </svg>
                          ) : (
                            <svg className="w-4.5 h-4.5 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          )}
                          <span className="font-bold text-xs text-white truncate">
                            {pl.name}
                          </span>
                          <span className="text-[10px] text-gray-500 shrink-0">
                            ({folderVideos.length} {folderVideos.length === 1 ? 'video' : 'videos'})
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isAdmin && (
                            <button
                              onClick={(e) => onDeletePlaylist(e, pl.id)}
                              className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                              title="Delete Folder"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          <div
                            onClick={() => togglePlaylist(pl.id)}
                            className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer"
                          >
                            <svg
                              className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="flex flex-col gap-1.5 mt-1 pl-2 border-l border-white/5 ml-3.5 pb-1">
                          {folderVideos.length === 0 ? (
                            <div className="text-[10px] text-gray-500 italic py-2 pl-3">
                              Empty folder.
                            </div>
                          ) : (
                            folderVideos.map((v, vIdx) => renderVideoItem(v, false, vIdx === 0, vIdx === folderVideos.length - 1))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Render Standalone Videos */}
                {standaloneVideos.map((v) => renderVideoItem(v, false))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Upload & Index */}
      {activeTab === 'upload' && (
        <div className="flex flex-col gap-4 flex-grow min-h-0 animate-fade-in">
          <VideoIndexer
            videos={videos}
            indexingLoading={indexingLoading}
            playlists={playlists}
            fetchPlaylists={fetchPlaylists}
            pendingAutoSelectId={pendingAutoSelectId}
            onIndexStart={onIndexStart}
            onIndexSuccess={(vidId) => {
              if (onIndexSuccess) onIndexSuccess(vidId);
              // Auto-switch to catalog library tab to watch progress
              setActiveTab('library');
            }}
            onIndexError={onIndexError}
            onDeleteVideo={onDeleteVideo}
            showSuccess={showSuccess}
            showError={showError}
            initialPlaylistId={initialPlaylistId}
            currentUser={currentUser}
          />
        </div>
      )}
    </div>
  );
}
