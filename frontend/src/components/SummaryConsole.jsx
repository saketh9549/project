import React, { useState, useEffect } from 'react';

export default function SummaryConsole({ selectedChapter, chapters = [], showSuccess }) {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCacheStatus, setSummaryCacheStatus] = useState(false);

  useEffect(() => {
    if (selectedChapter) {
      fetchSummary(selectedChapter);
    } else {
      setSummary(null);
    }
  }, [selectedChapter]);

  const fetchSummary = async (chapter) => {
    setSummary(null);
    setSummaryLoading(true);
    
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapter.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to summarize chapter');
      
      setSummary(data.summary);
      setSummaryCacheStatus(data.cached);
    } catch (err) {
      setSummary(`*Error generating summary:* ${err.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const copySummaryToClipboard = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    if (showSuccess) {
      showSuccess('Summary copied to clipboard!');
      setTimeout(() => showSuccess(null), 3000);
    }
  };

  const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-md font-bold text-cyan-400 mt-4 mb-2 font-display uppercase tracking-wider">{line.substring(4)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-lg font-bold text-indigo-400 mt-5 mb-2 font-display">{line.substring(3)}</h2>;
      }
      if (line.startsWith('• ') || line.startsWith('* ') || line.startsWith('- ')) {
        const content = line.replace(/^[•*\-]\s+/, '');
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 my-1.5 pl-1 leading-relaxed">
            {parseBold(content)}
          </li>
        );
      }
      return <p key={idx} className="text-gray-300 my-2 leading-relaxed text-sm">{parseBold(line)}</p>;
    });
  };

  const parseBold = (text) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="text-white font-semibold">{part}</strong>;
      }
      return part;
    });
  };

  if (!selectedChapter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <div className="h-14 w-14 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold font-display text-white mb-1">
          Summary Console
        </h3>
        <p className="text-gray-500 text-xs max-w-[200px]">
          Click on any chapter moment in the timeline to view or generate its bulleted AI summary.
        </p>
      </div>
    );
  }

  const originalIndex = chapters && selectedChapter
    ? chapters.findIndex(item => item.id === selectedChapter.id)
    : -1;
  const sectionName = originalIndex !== -1 ? `section-${originalIndex + 1}` : selectedChapter?.id;

  return (
    <div className="flex-grow flex flex-col min-h-0">
      {/* Console Header */}
      <div className="border-b border-white/5 pb-3 mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-xs font-mono font-semibold text-cyan-400">
            {sectionName}
          </h3>
          <p className="text-xs text-white font-bold font-display mt-0.5 truncate max-w-[170px]">
            {selectedChapter.topic_title}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
            [{selectedChapter.start_time_str} → {selectedChapter.end_time_str}]
          </p>
        </div>
        
        {summary && !summaryLoading && (
          <button
            onClick={copySummaryToClipboard}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
            title="Copy Summary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        )}
      </div>

      {/* Console Body */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col">
        {summaryLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-cyan-400 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-xs text-gray-400 animate-pulse-glow">Generating AI Summary...</span>
          </div>
        ) : summary ? (
          <div className="text-left select-text pb-4">
            {summaryCacheStatus && (
              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase mb-3">
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.585a.75.75 0 011.05-.184l9 6.25a.75.75 0 010 1.238l-9 6.25a.75.75 0 11-.866-1.237L14.71 10 6.452 4.266a.75.75 0 01-.185-1.05z" clipRule="evenodd" />
                </svg>
                Cached Summary
              </span>
            )}
            <div className="prose prose-invert max-w-none">
              {renderMarkdown(summary)}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center py-8">
            <p className="text-gray-500 text-xs text-center mb-4">No summary generated yet.</p>
            <button
              onClick={() => fetchSummary(selectedChapter)}
              className="bg-gray-900 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/10 active:scale-[0.98] font-bold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer"
            >
              Summarize with Gemini
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
