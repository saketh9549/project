import React, { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export default function SummaryConsole({
  selectedChapter,
  chapters = [],
  showSuccess,
  summaryTab = 'section',
  setSummaryTab,
  overallSummary,
  overallSummaryLoading,
  onGenerateOverallSummary
}) {
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
      const response = await fetch(apiUrl('/api/summarize'), {
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
    const textToCopy = summaryTab === 'section' ? summary : overallSummary;
    if (!textToCopy) return;
    const plainText = stripMarkdown(textToCopy);
    navigator.clipboard.writeText(plainText);
    if (showSuccess) {
      showSuccess('Summary copied to clipboard!');
      setTimeout(() => showSuccess(null), 3000);
    }
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
    // Parse **bold** and *italic*
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
    
    // Clean conversational intros first
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
        const content = line.replace(/^[•*\-]\s+/, '');
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 my-1.5 pl-1 leading-relaxed text-xs">
            {parseInline(content)}
          </li>
        );
      }
      
      // Render normal paragraph
      if (trimmed === '') return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-gray-300 my-2 leading-relaxed text-xs">
          {parseInline(line)}
        </p>
      );
    });
  };

  const isSection = summaryTab === 'section';
  const originalIndex = chapters && selectedChapter
    ? chapters.findIndex(item => item.id === selectedChapter.id)
    : -1;
  const sectionName = originalIndex !== -1 ? `section-${originalIndex + 1}` : selectedChapter?.id;

  return (
    <div className="grow flex flex-col min-h-0">
      {/* Tab Switcher */}
      <div className="flex border-b border-white/5 mb-4 shrink-0">
        <button
          onClick={() => setSummaryTab('section')}
          type="button"
          className={`flex-1 text-center font-bold font-display py-2 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${summaryTab === 'section'
            ? 'text-cyan-400 border-cyan-500 shadow-[inset_0_-2px_0_0_rgb(6,182,212)]'
            : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
        >
          SECTION
        </button>
        <button
          onClick={() => setSummaryTab('overall')}
          type="button"
          className={`flex-1 text-center font-bold font-display py-2 text-xs tracking-wider border-b-2 transition-all cursor-pointer ${summaryTab === 'overall'
            ? 'text-cyan-400 border-cyan-500 shadow-[inset_0_-2px_0_0_rgb(6,182,212)]'
            : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
        >
          OVERALL
        </button>
      </div>

      {isSection ? (
        // --- Section Summary View ---
        !selectedChapter ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="h-14 w-14 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold font-display text-white mb-1">
              Section Summary
            </h3>
            <p className="text-gray-500 text-xs max-w-50">
              Click on any chapter moment in the timeline to view or generate its bulleted AI summary.
            </p>
          </div>
        ) : (
          <div className="grow flex flex-col min-h-0">
            {/* Console Header */}
            <div className="border-b border-white/5 pb-3 mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <span className="section-badge mb-1">
                  {sectionName}
                </span>
                <p className="text-xs text-white font-bold font-display mt-0.5 truncate" title={selectedChapter.topic_title}>
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
                <div className="grow flex flex-col items-center justify-center py-8">
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
        )
      ) : (
        // --- Overall Summary View ---
        <div className="grow flex flex-col min-h-0">
          {/* Console Header */}
          <div className="border-b border-white/5 pb-3 mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-mono font-semibold text-cyan-400">
                OVERALL SUMMARY
              </h3>
              <p className="text-xs text-white font-bold font-display mt-0.5 truncate">
                Section-wise summary
              </p>
            </div>
            
            {overallSummary && !overallSummaryLoading && (
              <button
                onClick={copySummaryToClipboard}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
                title="Copy Overall Summary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            )}
          </div>

          {/* Console Body */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col">
            {overallSummaryLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-cyan-400 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs text-gray-400 animate-pulse-glow">Generating Overall Summary...</span>
              </div>
            ) : overallSummary ? (
              <div className="text-left select-text pb-4">
                <div className="prose prose-invert max-w-none">
                  {renderMarkdown(overallSummary)}
                </div>
              </div>
            ) : (
              <div className="grow flex flex-col items-center justify-center py-8">
                <p className="text-gray-500 text-xs text-center mb-4">No overall summary generated yet.</p>
                <button
                  onClick={onGenerateOverallSummary}
                  className="bg-gray-900 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/10 active:scale-[0.98] font-bold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Generate Overall Summary
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
