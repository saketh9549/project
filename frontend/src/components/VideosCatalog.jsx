import React from 'react';

export default function VideosCatalog({ videos, selectedVideo, onSelectVideo, onDeleteVideo }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {videos.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-12 font-mono">
            No videos indexed yet.
          </div>
        ) : (
          videos.map((v) => {
            const isSelected = selectedVideo && selectedVideo.id === v.id;
            return (
              <div
                key={v.id}
                onClick={() => onSelectVideo(v)}
                className={`glass-panel glass-panel-hover p-3.5 rounded-xl cursor-pointer flex items-start justify-between gap-3 border transition-all ${
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-950/20 shadow-[0_0_10px_rgba(99,102,241,0.08)]'
                    : 'border-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs text-gray-200 truncate group-hover:text-white">
                    {v.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1 font-mono">
                      <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {v.duration_str}
                    </span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500 font-mono text-[9px] truncate max-w-[80px]">{v.id}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => onDeleteVideo(e, v.id)}
                  className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                  title="Delete Video"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
