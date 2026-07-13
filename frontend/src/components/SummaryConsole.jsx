import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

const parseTranscript = (rawText) => {
  if (!rawText) return [];
  return rawText.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Look for [start -> end] text
    const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      const timePart = match[1];
      const text = match[2];
      const times = timePart.split('->').map(t => t.trim());
      if (times.length === 2) {
        const startStr = times[0];
        const endStr = times[1];

        // Parse startStr to seconds
        const parts = startStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) {
          seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          seconds = parts[0] * 60 + parts[1];
        }

        return {
          id: idx,
          startStr,
          endStr,
          seconds,
          text
        };
      }
    }
    return {
      id: idx,
      text: trimmed
    };
  }).filter(Boolean);
};

export default function SummaryConsole({
  selectedVideo,
  selectedChapter,
  chapters,
  onSelectChapter,
  showSuccess,
  overallSummary,
  overallSummaryLoading,
  onGenerateOverallSummary,
  currentTime = 0,
  currentUser
}) {
  const [activeTab, setActiveTab] = useState('transcript');
  
  // Notepad states
  const [notesText, setNotesText] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const lines = selectedVideo?.raw_transcript ? parseTranscript(selectedVideo.raw_transcript) : [];
  const currentActiveLine = lines.find((line, idx) => {
    if (line.seconds === undefined) return false;
    const nextLineWithSeconds = lines.slice(idx + 1).find(l => l.seconds !== undefined);
    return currentTime >= line.seconds && (!nextLineWithSeconds || currentTime < nextLineWithSeconds.seconds);
  });
  const activeLineId = currentActiveLine ? currentActiveLine.id : null;

  // Automatically scroll active transcript line into view when it changes
  useEffect(() => {
    if (activeTab === 'transcript' && activeLineId !== null) {
      const activeElement = document.querySelector(`[data-line-id="${activeLineId}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeLineId, activeTab]);

  // Automatically scroll first highlighted transcript line into view when selectedChapter changes
  useEffect(() => {
    if (activeTab === 'transcript' && selectedChapter) {
      const timer = setTimeout(() => {
        const firstHighlighted = document.querySelector('[data-highlighted="true"]');
        if (firstHighlighted) {
          firstHighlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedChapter, activeTab]);

  // Load notes from AWS S3 whenever video or user changes
  useEffect(() => {
    if (!selectedVideo?.id || !currentUser?.email) {
      setNotesText('');
      setHasUnsavedChanges(false);
      return;
    }

    const loadNotes = async () => {
      setNotesLoading(true);
      try {
        const response = await fetch(
          apiUrl(`/api/notes?video_id=${selectedVideo.id}&owner_email=${encodeURIComponent(currentUser.email)}`)
        );
        if (response.ok) {
          const resData = await response.json();
          setNotesText(resData.notes || '');
        } else {
          setNotesText('');
        }
      } catch (err) {
        console.error('Failed to load notes from S3:', err);
        setNotesText('');
      } finally {
        setNotesLoading(false);
        setHasUnsavedChanges(false);
      }
    };

    loadNotes();
  }, [selectedVideo?.id, currentUser?.email]);

  const handleSaveNotes = async () => {
    if (!selectedVideo?.id || !currentUser?.email) return;
    setIsSaving(true);
    try {
      const response = await fetch(apiUrl('/api/notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: selectedVideo.id,
          owner_email: currentUser.email,
          notes: notesText
        })
      });
      if (!response.ok) throw new Error('Failed to upload notes to S3');
      setHasUnsavedChanges(false);
      if (showSuccess) {
        showSuccess('Notes saved to S3 successfully!');
      }
    } catch (err) {
      alert('Error saving notes to S3: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S for manual saving
  useEffect(() => {
    if (activeTab !== 'notes') return;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveNotes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, notesText, selectedVideo?.id, currentUser?.email]);

  const copyToClipboard = () => {
    const textToCopy =
      activeTab === 'summary'
        ? overallSummary
        : activeTab === 'notes'
        ? notesText
        : selectedVideo?.raw_transcript;

    if (!textToCopy) return;
    const plainText = activeTab === 'summary' ? stripMarkdown(textToCopy) : textToCopy;
    navigator.clipboard.writeText(plainText);
    if (showSuccess) {
      let msg = 'Transcript copied to clipboard!';
      if (activeTab === 'summary') msg = 'Summary copied to clipboard!';
      if (activeTab === 'notes') msg = 'Notes copied to clipboard!';
      showSuccess(msg);
    }
  };

  const exportNotesAsFile = () => {
    if (!notesText) return;
    const blob = new Blob([notesText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedVideo?.file_name || 'video'}_notes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const stripMarkdown = (text) => {
    if (!text) return '';
    let cleaned = text;

    // 1. Remove introductory lines if any
    cleaned = cleanSummaryText(cleaned);

    // 2. Remove horizontal rules (--- or ***)
    cleaned = cleaned.replace(/^\s*[-*_]{3,}\s*$/gm, '');

    // 3. Remove header symbols (#, ##, ###) at the start of lines
    cleaned = cleaned.replace(/^\s*#+\s+/gm, '');

    // 4. Remove bold and italic markers (**bold**, __bold__, *italic*, _italic_)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

    // 5. Remove list markers (-, *, •) at the start of lines
    cleaned = cleaned.replace(/^\s*[-*•]\s+/gm, '');

    // 6. Clean up trailing or multiple consecutive empty lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  };

  const cleanSummaryText = (text) => {
    if (!text) return '';
    let lines = text.split('\n');
    // Trim empty lines at start
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    // Remove common introductory conversational lines
    const introPatterns = [
      /here is a (concise )?summary of the (video )?(chapter|section):/i,
      /here is a (concise )?summary:/i,
      /this chapter covers the following/i,
      /this section covers/i,
      /in this section/i
    ];
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      const matchesIntro = introPatterns.some(pattern => pattern.test(firstLine));
      if (matchesIntro) {
        lines.shift();
      }
    }
    // Trim empty lines again
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    return lines.join('\n');
  };

  const parseInline = (text) => {
    if (!text) return '';
    const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={index} className="text-cyan-400 font-medium not-italic bg-cyan-950/40 px-2 py-0.5 rounded-md border border-cyan-500/10 font-mono text-[10px]">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  const renderMarkdown = (text) => {
    if (!text) return null;

    const cleanedText = cleanSummaryText(text);
    const lines = cleanedText.split('\n');

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed === '---' || trimmed === '***') {
        return <hr key={idx} className="border-t border-white/5 my-5" />;
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-sm font-extrabold text-cyan-400 mt-6 mb-3 font-display uppercase tracking-wider border-b border-cyan-500/10 pb-1">
            {parseInline(line.substring(2))}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-xs font-bold text-indigo-400 mt-5 mb-2 font-display uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></span>
            {parseInline(line.substring(3))}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-[11px] font-bold text-gray-200 mt-4 mb-2 font-display uppercase tracking-wider">
            {parseInline(line.substring(4))}
          </h3>
        );
      }
      if (line.startsWith('• ') || line.startsWith('* ') || line.startsWith('- ')) {
        const content = line.replace(/^[•*-]\s+/, '');
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 my-1.5 pl-1 leading-relaxed text-xs">
            {parseInline(content)}
          </li>
        );
      }

      if (trimmed === '') return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-gray-300 my-2 leading-relaxed text-xs">
          {parseInline(line)}
        </p>
      );
    });
  };

  return (
    <div className="flex-grow flex flex-col min-h-0">
      {/* Tab Selector Header */}
      <div className="flex border-b border-white/5 pb-2 mb-4 shrink-0 justify-between items-center gap-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('transcript')}
            className={`pb-1 text-xs font-bold font-display uppercase tracking-widest cursor-pointer transition-colors relative ${
              activeTab === 'transcript'
                ? 'text-cyan-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Transcript
            {activeTab === 'transcript' && (
              <span className="absolute left-0 right-0 -bottom-[9px] h-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-1 text-xs font-bold font-display uppercase tracking-widest cursor-pointer transition-colors relative ${
              activeTab === 'summary'
                ? 'text-cyan-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Summary
            {activeTab === 'summary' && (
              <span className="absolute left-0 right-0 -bottom-[9px] h-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            )}
          </button>
          {currentUser?.role !== 'admin' && (
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-1 text-xs font-bold font-display uppercase tracking-widest cursor-pointer transition-colors relative ${
                activeTab === 'notes'
                  ? 'text-cyan-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Notes
              {activeTab === 'notes' && (
                <span className="absolute left-0 right-0 -bottom-[9px] h-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
            </button>
          )}
        </div>

        {((activeTab === 'summary' && overallSummary && !overallSummaryLoading) ||
          (activeTab === 'transcript' && selectedVideo?.raw_transcript) ||
          (activeTab === 'notes' && notesText && !notesLoading)) && (
          <button
            onClick={copyToClipboard}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
            title={activeTab === 'notes' ? 'Copy Notes' : activeTab === 'summary' ? 'Copy Summary' : 'Copy Transcript'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col min-h-0">
        {activeTab === 'summary' && (
          <div className="flex-grow flex flex-col min-h-0">
            {overallSummaryLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-cyan-400 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs text-gray-400 animate-pulse-glow">Generating Summary...</span>
              </div>
            ) : overallSummary ? (
              <div className="text-left select-text pb-4">
                <div className="prose prose-invert max-w-none">
                  {renderMarkdown(overallSummary)}
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-8">
                <p className="text-gray-500 text-xs text-center mb-4">No summary generated yet.</p>
                <button
                  onClick={onGenerateOverallSummary}
                  className="bg-gray-900 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/10 active:scale-[0.98] font-bold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Generate Summary
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="flex-grow flex flex-col min-h-0">
            {selectedVideo?.raw_transcript ? (
              <div className="text-left select-text pb-4 flex flex-col gap-2">
                {lines.map((line) => {
                  if (line.startStr) {
                    const isHighlighted = selectedChapter &&
                                          line.seconds >= selectedChapter.start_time &&
                                          line.seconds < selectedChapter.end_time;
                    const isActiveLine = activeLineId === line.id;
                    return (
                      <div
                        key={line.id}
                        data-line-id={line.id}
                        data-highlighted={isHighlighted}
                        onClick={() => {
                          const videoEl = document.getElementById('main-video-player');
                          if (videoEl) {
                            videoEl.currentTime = line.seconds;
                            videoEl.play().catch(err => console.warn(err));
                          }
                          if (chapters && onSelectChapter) {
                            const matchingChapter = chapters.find(
                              ch => line.seconds >= ch.start_time && line.seconds < ch.end_time
                            );
                            if (matchingChapter) {
                              onSelectChapter(matchingChapter);
                            }
                          }
                        }}
                        className={`flex items-start gap-3 p-2 rounded-xl transition-all cursor-pointer group border ${
                          isActiveLine
                            ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                            : isHighlighted
                            ? 'bg-cyan-950/20 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.05)]'
                            : 'border-transparent hover:bg-white/5 hover:border-white/5'
                        }`}
                      >
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg shrink-0 select-none mt-0.5 transition-all border ${
                          isActiveLine
                            ? 'text-black bg-cyan-400 border-cyan-400 font-bold shadow-[0_0_10px_rgba(6,182,212,0.5)] scale-[1.03]'
                            : isHighlighted
                            ? 'text-cyan-400 bg-cyan-950/40 border-cyan-500/10 font-bold'
                            : 'text-cyan-400 bg-cyan-950/40 border-cyan-500/10 font-bold'
                        }`}>
                          {line.startStr}
                        </span>
                        <span className={`text-xs leading-relaxed transition-colors ${
                          isActiveLine
                            ? 'text-white font-semibold'
                            : isHighlighted
                            ? 'text-white font-medium'
                            : 'text-gray-300 group-hover:text-white'
                        }`}>
                          {line.text}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <p key={line.id} className="text-xs text-gray-300 leading-relaxed text-left px-2">
                      {line.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-12 text-center">
                <svg className="w-10 h-10 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p className="text-gray-500 text-xs px-4">No transcript text is available for this media file.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Interactive Notepad (Loads & Saves to S3) */}
        {activeTab === 'notes' && currentUser?.role !== 'admin' && (
          <div className="flex-grow flex flex-col min-h-0 text-left p-1 animate-fade-in">
            {notesLoading ? (
              <div className="flex-grow flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-6 w-6 text-cyan-400 mb-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-[10px] text-gray-500 font-mono">Fetching notes from S3...</span>
              </div>
            ) : (
              <div className="flex-grow flex flex-col gap-3.5 min-h-0">
                {/* Notes Toolbar */}
                <div className="flex items-center justify-between gap-3 bg-white/2 border border-white/5 p-2 rounded-xl shrink-0">
                  <div className="flex items-center gap-1.5">
                    {hasUnsavedChanges ? (
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-fade-in">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Unsaved
                      </span>
                    ) : (
                      <div className="w-4 h-4" /> // spacing placeholder
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Clear Button */}
                    {notesText && (
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to clear your notes?')) {
                            setNotesText('');
                            setHasUnsavedChanges(true);
                          }
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                        title="Clear Notes"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}

                    {/* Export File Button */}
                    {notesText && (
                      <button
                        onClick={exportNotesAsFile}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                        title="Export as .txt"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    )}

                    {/* Save notes Button */}
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSaving}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all select-none border cursor-pointer ${
                        isSaving
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : hasUnsavedChanges
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-600 shadow-md scale-[1.01]'
                          : 'bg-white/5 text-gray-400 hover:text-white border-white/5'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Save Notes
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Notepad Text Editor */}
                <div className="flex-grow flex flex-col min-h-0 relative">
                  <textarea
                    value={notesText}
                    onChange={(e) => {
                      setNotesText(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Write your study notes and key takeaways here... Press Ctrl+S (or Cmd+S) to save directly to S3."
                    className="w-full flex-grow bg-black/25 border border-white/5 rounded-2xl p-4 text-xs text-slate-400 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 transition-all resize-none leading-relaxed font-sans"
                    disabled={isSaving}
                  />
                  <div className="absolute right-3.5 bottom-3.5 text-[9px] text-gray-600 font-mono pointer-events-none select-none">
                    {notesText.length} characters
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
