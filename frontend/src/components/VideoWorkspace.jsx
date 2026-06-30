import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TimelineExplorer from './TimelineExplorer';
import SummaryConsole from './SummaryConsole';
import QuizPlayer from './QuizPlayer';
import { apiUrl } from '../lib/api';

// Helper for course details
const getCourseMeta = (playlistName) => {
  const name = playlistName.toLowerCase();
  if (name.includes('mysql') || name.includes('sql') || name.includes('database')) {
    return {
      bannerTitle: "DATABASE ESSENTIALS",
      bannerSubtitle: "WITH MYSQL FOR ANALYSTS",
      bgGradient: "from-blue-950 via-[#0b2e66] to-slate-900"
    };
  }
  if (name.includes('python') || name.includes('py') || name.includes('programming')) {
    return {
      bannerTitle: "PYTHON PROGRAMMING",
      bannerSubtitle: "DEVELOPER WORKSPACE",
      bgGradient: "from-yellow-950 via-[#453c16] to-slate-900"
    };
  }
  if (name.includes('stat') || name.includes('math') || name.includes('analyt')) {
    return {
      bannerTitle: "ADVANCED STATISTICS",
      bannerSubtitle: "FOR ANALYTICS & BI",
      bgGradient: "from-pink-950 via-[#691136] to-slate-900"
    };
  }
  return {
    bannerTitle: playlistName.toUpperCase(),
    bannerSubtitle: "WORKSPACE MODULE",
    bgGradient: "from-indigo-950 via-slate-900 to-cyan-950"
  };
};

export default function VideoWorkspace({ currentUser, showSuccess, showError }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = currentUser?.role === 'admin';
  const shouldShowAdminTools = isAdmin && location.state?.from !== '/home';

  // Active content selection in the workspace:
  // { type: 'video' | 'quiz', id: string }
  const [activeContent, setActiveContent] = useState({ type: 'video', id: id });

  // Quiz Player workflow state:
  // 'landing' -> Shows "View Assignment" card, 'active' -> Plays quiz
  const [quizViewState, setQuizViewState] = useState('landing');

  // Video / Course states
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [overallSummary, setOverallSummary] = useState(null);
  const [overallSummaryLoading, setOverallSummaryLoading] = useState(false);

  // Folder / playlist context
  const [folderName, setFolderName] = useState('Workspace Media');
  const [folderVideos, setFolderVideos] = useState([]);
  const [folderQuizzes, setFolderQuizzes] = useState([]);

  // Watched lessons states
  const [watchedList, setWatchedList] = useState([]);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);

  // Sidebar accordions expanded state
  const [accordionState, setAccordionState] = useState({
    lessons: true,
    quizzes: true,
    challenges: false,
    notes: false
  });

  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Split resizer state
  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return (window.innerWidth - 300) / 2;
    }
    return 450;
  });

  const toggleAccordion = (section) => {
    setAccordionState(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleTimeUpdate = (time) => {
    setCurrentTime(time);
    if (chapters && chapters.length > 0) {
      const activeChapter = chapters.find(
        (c) => time >= c.start_time && time < c.end_time
      );
      if (activeChapter && (!selectedChapter || selectedChapter.id !== activeChapter.id)) {
        setSelectedChapter(activeChapter);
      }
    }
  };

  const loadProgressData = () => {
    const watched = JSON.parse(localStorage.getItem('summarix_watched') || '[]');
    const quizzesDone = JSON.parse(localStorage.getItem('summarix_completed_quizzes') || '[]');
    setWatchedList(watched);
    setCompletedQuizzes(quizzesDone);
  };

  useEffect(() => {
    loadProgressData();
    window.addEventListener('summarix_watched_change', loadProgressData);
    return () => window.removeEventListener('summarix_watched_change', loadProgressData);
  }, []);

  // Fetch all metadata on video change
  const fetchWorkspaceData = async (videoId) => {
    setLoading(true);
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';

      // 1. Fetch active video details
      const response = await fetch(apiUrl(`/api/videos/${videoId}?owner_email=${encodeURIComponent(email)}&role=${role}`));
      if (!response.ok) throw new Error('Failed to load video workspace');
      const data = await response.json();

      setChapters(data.chapters || []);
      if (data.video) {
        setSelectedVideo(data.video);
        if (data.video.overall_summary) {
          setOverallSummary(data.video.overall_summary);
        } else {
          setOverallSummary(null);
        }
      }

      // 2. Fetch all videos to resolve playlist siblings
      const allVideosRes = await fetch(apiUrl(`/api/videos?owner_email=${encodeURIComponent(email)}&role=${role}`));
      if (allVideosRes.ok) {
        const allVideos = await allVideosRes.json();

        // Find playlist context
        const playlistId = data.video?.playlist_id;
        if (playlistId) {
          // Filter sibling videos inside the playlist
          const siblings = allVideos.filter(v => v.playlist_id === playlistId && v.upload_status === 'indexed');
          setFolderVideos(siblings);

          // Fetch playlist name
          const playlistsRes = await fetch(apiUrl(`/api/playlists?owner_email=${encodeURIComponent(email)}&role=${role}`));
          if (playlistsRes.ok) {
            const playlistsData = await playlistsRes.json();
            const matchedPl = playlistsData.find(p => p.id === playlistId);
            if (matchedPl) {
              setFolderName(matchedPl.name);
            }
          }

          // 3. Scan quizzes for all folder videos
          const quizList = [];
          for (let sib of siblings) {
            try {
              const quizRes = await fetch(apiUrl(`/api/quizzes?video_id=${sib.id}`));
              if (quizRes.ok) {
                const quizData = await quizRes.json();
                quizList.push({ ...quizData, videoId: sib.id });
              }
            } catch {
              // Quiz not found or failed, ignore
            }
          }

          // Fetch playlist-level quiz
          try {
            const playlistQuizRes = await fetch(apiUrl(`/api/quizzes?playlist_id=${playlistId}`));
            if (playlistQuizRes.ok) {
              const playlistQuizData = await playlistQuizRes.json();
              quizList.push({ ...playlistQuizData, playlistId });
            }
          } catch {
            // Quiz not found or failed, ignore
          }

          setFolderQuizzes(quizList);
        } else {
          // Standalone video context
          setFolderVideos([data.video]);
          setFolderName(data.video?.file_name || 'Workspace Media');

          // Scan for single video quiz
          try {
            const quizRes = await fetch(apiUrl(`/api/quizzes?video_id=${videoId}`));
            if (quizRes.ok) {
              const quizData = await quizRes.json();
              setFolderQuizzes([{ ...quizData, videoId }]);
            }
          } catch {
            setFolderQuizzes([]);
          }
        }
      }
    } catch (err) {
      showError('Could not load workspace files: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchWorkspaceData(id);
      setActiveContent({ type: 'video', id: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentUser]);

  const currentIndex = selectedVideo && folderVideos.length > 0
    ? folderVideos.findIndex(v => v.id === selectedVideo.id)
    : -1;
  const hasPrevVideo = currentIndex > 0;
  const hasNextVideo = currentIndex !== -1 && currentIndex < folderVideos.length - 1;

  const handlePrevVideo = () => {
    if (hasPrevVideo) {
      const prevVideo = folderVideos[currentIndex - 1];
      navigate(`/video/${prevVideo.id}`, { state: location.state });
    }
  };

  const handleNextVideo = () => {
    if (hasNextVideo) {
      const nextVideo = folderVideos[currentIndex + 1];
      navigate(`/video/${nextVideo.id}`, { state: location.state });
    }
  };

  const handleBack = () => {
    const fromPath = location.state?.from || '/home';
    if (fromPath === '/catalog') {
      navigate('/catalog', { state: { playlistId: selectedVideo?.playlist_id } });
    } else {
      navigate(fromPath);
    }
  };

  const handleSelectVideoContent = (videoId) => {
    setActiveContent({ type: 'video', id: videoId });
    setQuizViewState('landing');
    fetchWorkspaceData(videoId);
  };

  const handleSelectQuizContent = (quizId) => {
    setActiveContent({ type: 'quiz', id: quizId });
    setQuizViewState('landing');
  };

  const handleGenerateOverallSummary = async () => {
    if (!selectedVideo) return;
    setOverallSummaryLoading(true);
    showError(null);
    showSuccess('Generating overall summary with Gemini... Please wait.');

    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const response = await fetch(apiUrl(`/api/overall-summary?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: selectedVideo.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate overall summary');

      setOverallSummary(data.overall_summary);
      showSuccess('Overall summary generated successfully!');
    } catch (err) {
      showError('Failed to generate overall summary: ' + err.message);
    } finally {
      setOverallSummaryLoading(false);
    }
  };
  const handleVideoEnded = () => {
    if (!selectedVideo) return;
    const matchedQuiz = folderQuizzes.find(
      (q) => q.catalogId === selectedVideo.id || q.videoId === selectedVideo.id
    );
    if (matchedQuiz) {
      showSuccess("Video completed! Loading practice quiz...");
      setTimeout(() => {
        setActiveContent({ type: 'quiz', id: matchedQuiz._id });
        setQuizViewState('landing');
      }, 1000);
    }
  };


  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = window.innerWidth - 650; // Protect spacing
      const newWidth = Math.max(280, Math.min(maxW, startWidth - deltaX));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (loading) {
    return (
      <div className="flex-grow flex-1 flex flex-col items-center justify-center py-24">
        <svg className="animate-spin h-8 w-8 text-cyan-400 mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs text-gray-400 animate-pulse-glow">Loading Course Workspace...</span>
      </div>
    );
  }

  // Course progress calculations
  const totalLessons = folderVideos.length;
  const watchedLessons = folderVideos.filter(v => watchedList.includes(v.id)).length;
  const progressPercent = totalLessons > 0 ? Math.round((watchedLessons / totalLessons) * 100) : 0;
  const meta = getCourseMeta(folderName);

  const selectedQuiz = folderQuizzes.find(q => q._id === activeContent.id);

  if (isAdmin) {
    return (
      <div className="flex-grow flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-hidden relative gap-6 lg:gap-0">
        {/* Center Panel (Timeline Explorer) */}
        <main className="flex-grow flex-1 glass-panel p-6 rounded-2xl flex flex-col min-w-0 min-h-0">
          <TimelineExplorer
            key={selectedVideo?.id}
            selectedVideo={selectedVideo}
            chapters={chapters}
            selectedChapter={selectedChapter}
            onSelectChapter={setSelectedChapter}
            currentTime={currentTime}
            onTimeUpdate={handleTimeUpdate}
            isAdmin={shouldShowAdminTools}
            currentUser={currentUser}
            onUploadNew={() => navigate('/catalog', { state: { openUpload: true, playlistId: selectedVideo?.playlist_id } })}
            onBack={handleBack}
            onVideoEnded={handleVideoEnded}
            onPrevVideo={handlePrevVideo}
            onNextVideo={handleNextVideo}
            hasPrevVideo={hasPrevVideo}
            hasNextVideo={hasNextVideo}
          />
        </main>

        {/* Interactive Splitter Divider */}
        <div
          onMouseDown={handleMouseDown}
          className="hidden lg:flex items-center justify-center w-4 cursor-col-resize group select-none relative z-20 hover:scale-x-110 transition-transform"
        >
          {/* Splitter track visual */}
          <div className="w-[1px] h-full bg-white/5 group-hover:bg-indigo-500/30 group-active:bg-indigo-500/50 rounded transition-colors" />
          {/* Grab handle grip */}
          <div className="absolute w-1.5 h-8 bg-white/10 group-hover:bg-indigo-400 group-active:bg-indigo-500 rounded-full border border-white/10 shadow-[0_0_10px_rgba(99,102,241,0.2)] flex flex-col items-center justify-center gap-1 transition-all">
            <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
            <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
            <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
          </div>
        </div>

        {/* Right Sidebar (Summary Console) */}
        <aside className="resizable-right-panel w-full lg:w-auto shrink-0 glass-panel p-5 rounded-2xl flex flex-col min-h-0">
          <SummaryConsole
            selectedVideo={selectedVideo}
            selectedChapter={selectedChapter}
            chapters={chapters}
            onSelectChapter={setSelectedChapter}
            showSuccess={showSuccess}
            overallSummary={overallSummary}
            overallSummaryLoading={overallSummaryLoading}
            onGenerateOverallSummary={handleGenerateOverallSummary}
            currentTime={currentTime}
          />
        </aside>

        {/* Inline styles to drive the width responsively based on state */}
        <style>{`
          @media (min-width: 1024px) {
            .resizable-right-panel {
              width: ${rightWidth}px !important;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex-grow flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
      {/* Top Banner Navigation Selector Header (Image 2 style) */}
      <div className="flex border-b border-white/5 pb-2 mb-4 justify-between items-center gap-4 shrink-0 bg-white/2 p-3.5 rounded-2xl select-none">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white flex items-center justify-center font-extrabold text-sm cursor-pointer transition-all w-8 h-8 rounded-lg hover:bg-white/5 border border-transparent"
            title="Back to Folders"
          >
            <span>&larr;</span>
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer select-none border font-bold text-xs ${sidebarOpen
                ? 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? '<' : '>'}
          </button>

          <div className="flex gap-4 ml-2">
            <span
              className="text-xs font-bold font-sans cursor-pointer text-cyan-400 border-b-2 border-cyan-400 pb-2.5 -mb-3 transition-all"
            >
              Modules
            </span>
          </div>
        </div>
        <button className="text-xs text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all">
          <span>☆ Rate this course</span>
        </button>
      </div>

      {/* Workspace split screen columns: Left Sidebar Accordion + Right Workspace */}
      <div className="flex-grow flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative gap-6">

        {/* Left Column: LMS Course Outline Accordion (Image 2 style) */}
        {sidebarOpen && (
          <aside className="w-full lg:w-80 shrink-0 glass-panel p-4 rounded-2xl flex flex-col gap-4 min-h-0 overflow-y-auto select-none">
            {/* Module course progress card header */}
            <div className={`p-4 rounded-xl bg-gradient-to-br ${meta.bgGradient} border border-white/5 shadow-md flex flex-col gap-3 relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl" />
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <h4 className="font-extrabold text-[11px] text-white truncate max-w-[180px]" title={folderName}>
                    {folderName}
                  </h4>
                  <p className="text-[8px] text-cyan-400 font-bold uppercase tracking-wider mt-0.5">
                    Course Workspace
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="flex flex-col gap-1 border-t border-white/5 pt-2.5">
                <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.3)] transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8.5px] font-bold font-mono text-gray-300">
                  <span>Course Progress</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>
            </div>

            {/* Collapsible Accordion Items */}
            <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1">
              {/* Accordion Item 1: Lessons & Chapters */}
              <div className="flex flex-col border border-white/5 bg-white/3 rounded-xl p-2.5 transition-all">
                <div
                  onClick={() => toggleAccordion('lessons')}
                  className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-white/5 transition-all rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                      Video Lectures
                    </span>
                    <span className="text-[8.5px] text-gray-500">
                      ({totalLessons})
                    </span>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 transform transition-transform ${accordionState.lessons ? 'rotate-180' : ''} text-gray-500`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {accordionState.lessons && (
                  <div className="flex flex-col gap-1.5 mt-2 pl-1 border-l border-white/5 ml-2 pb-0.5">
                    {folderVideos.map((v, index) => {
                      const isWatched = watchedList.includes(v.id);
                      const isActive = activeContent.type === 'video' && activeContent.id === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => handleSelectVideoContent(v.id)}
                          className={`flex items-start justify-between gap-2.5 p-2 rounded-xl border text-xs cursor-pointer select-none transition-all ${isActive
                              ? 'border-indigo-500/50 bg-indigo-950/20 text-white font-semibold'
                              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Checkmark circle icon */}
                            {isWatched ? (
                              <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-gray-600 bg-black/20 shrink-0" />
                            )}
                            <span className="truncate max-w-[180px]">
                              {index + 1}. {v.file_name}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Accordion Item 2: Practice Assessments (Quizzes) */}
              <div className="flex flex-col border border-white/5 bg-white/3 rounded-xl p-2.5 transition-all">
                <div
                  onClick={() => toggleAccordion('quizzes')}
                  className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-white/5 transition-all rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                      Assessments / Quizzes
                    </span>
                    <span className="text-[8.5px] text-gray-500">
                      ({folderQuizzes.length})
                    </span>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 transform transition-transform ${accordionState.quizzes ? 'rotate-180' : ''} text-gray-500`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {accordionState.quizzes && (
                  <div className="flex flex-col gap-1.5 mt-2 pl-1 border-l border-white/5 ml-2 pb-0.5">
                    {folderQuizzes.length === 0 ? (
                      <div className="text-[10px] text-gray-500 italic py-1.5 pl-3">
                        No quizzes configured.
                      </div>
                    ) : (
                      folderQuizzes.map((q) => {
                        const isDone = completedQuizzes.includes(q._id);
                        const isActive = activeContent.type === 'quiz' && activeContent.id === q._id;
                        return (
                          <div
                            key={q._id}
                            onClick={() => handleSelectQuizContent(q._id)}
                            className={`flex items-start justify-between gap-2.5 p-2 rounded-xl border text-xs cursor-pointer select-none transition-all ${isActive
                                ? 'border-indigo-500/50 bg-indigo-950/20 text-white font-semibold'
                                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isDone ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                  <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-gray-600 bg-black/20 shrink-0" />
                              )}
                              <span className="truncate max-w-[180px]">
                                📝 {q.title}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Accordion Item 3: Materials & Notes (Static Placeholders to match Image 2) */}
              <div className="flex flex-col border border-white/5 bg-white/3 rounded-xl p-2.5 transition-all">
                <div
                  onClick={() => toggleAccordion('notes')}
                  className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-white/5 transition-all rounded-lg"
                >
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    Materials & Notes
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transform transition-transform ${accordionState.notes ? 'rotate-180' : ''} text-gray-500`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {accordionState.notes && (
                  <div className="flex flex-col gap-1.5 mt-2 pl-1 border-l border-white/5 ml-2 text-[10px] text-gray-500 py-1.5 pl-3">
                    📘 Course reference booklet (.pdf)
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Right Column: Active Content Port (Image 2 style Workspace layout) */}
        <div className="flex-grow flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
          {activeContent.type === 'video' ? (
            /* 1. Video content workspace (split explorer + summaries) */
            <div className="flex-grow flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-hidden relative gap-6 lg:gap-0">
              <main className="flex-grow flex-1 glass-panel p-6 rounded-2xl flex flex-col min-w-0 min-h-0">
                <TimelineExplorer
                  key={selectedVideo?.id}
                  selectedVideo={selectedVideo}
                  chapters={chapters}
                  selectedChapter={selectedChapter}
                  onSelectChapter={setSelectedChapter}
                  currentTime={currentTime}
                  onTimeUpdate={handleTimeUpdate}
                  isAdmin={shouldShowAdminTools}
                  currentUser={currentUser}
                  onUploadNew={() => navigate('/catalog', { state: { openUpload: true, playlistId: selectedVideo?.playlist_id } })}
                  onBack={handleBack}
                  onVideoEnded={handleVideoEnded}
                  onPrevVideo={handlePrevVideo}
                  onNextVideo={handleNextVideo}
                  hasPrevVideo={hasPrevVideo}
                  hasNextVideo={hasNextVideo}
                />
              </main>

              <div
                onMouseDown={handleMouseDown}
                className="hidden lg:flex items-center justify-center w-4 cursor-col-resize group select-none relative z-20 hover:scale-x-110 transition-transform"
              >
                <div className="w-[1px] h-full bg-white/5 group-hover:bg-indigo-500/30 group-active:bg-indigo-500/50 rounded transition-colors" />
                <div className="absolute w-1.5 h-8 bg-white/10 group-hover:bg-indigo-400 group-active:bg-indigo-500 rounded-full border border-white/10 shadow-[0_0_10px_rgba(99,102,241,0.2)] flex flex-col items-center justify-center gap-1 transition-all">
                  <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/40"></span>
                </div>
              </div>

              <aside className="resizable-right-panel w-full lg:w-auto shrink-0 glass-panel p-5 rounded-2xl flex flex-col min-h-0">
                <SummaryConsole
                  selectedVideo={selectedVideo}
                  selectedChapter={selectedChapter}
                  chapters={chapters}
                  onSelectChapter={setSelectedChapter}
                  showSuccess={showSuccess}
                  overallSummary={overallSummary}
                  overallSummaryLoading={overallSummaryLoading}
                  onGenerateOverallSummary={handleGenerateOverallSummary}
                  currentTime={currentTime}
                />
              </aside>

              <style>{`
                @media (min-width: 1024px) {
                  .resizable-right-panel {
                    width: ${rightWidth}px !important;
                  }
                }
              `}</style>
            </div>
          ) : (
            /* 2. Quiz / Assignment Workspace card (Image 2 style player) */
            <div className="flex-grow flex-1 flex flex-col items-center justify-center p-4 min-h-0 h-full max-h-full w-full">
              {quizViewState === 'landing' && selectedQuiz ? (
                /* Pre-quiz Landing Dashboard (matches screenshot) */
                <div className="glass-panel p-8 rounded-2xl border border-white/5 shadow-2xl max-w-md w-full relative overflow-hidden bg-gradient-to-br from-indigo-950/10 to-slate-900/10 text-center animate-quiz-slide flex flex-col gap-6">
                  {/* Headline badge info */}
                  <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase font-mono mx-auto flex items-center gap-1.5">
                    <span>⏰ Results will be shared soon...</span>
                  </div>

                  {/* Core details */}
                  <div className="border-b border-white/5 pb-4">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest font-mono">
                      Assignment Module
                    </span>
                    <h3 className="text-lg font-extrabold text-white font-display mt-1">
                      {selectedQuiz.title}
                    </h3>
                  </div>

                  {/* Passing metrics */}
                  <div className="flex flex-col gap-3 font-sans text-xs text-left max-w-xs mx-auto w-full bg-black/20 p-4 rounded-xl border border-white/5">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-gray-400">Passing Percentage</span>
                      <span className="font-bold text-white">70%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Submissions</span>
                      <span className="font-bold text-white">Unlimited</span>
                    </div>
                  </div>

                  {/* View / Start button */}
                  <button
                    onClick={() => setQuizViewState('active')}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    View Assignment
                  </button>
                </div>
              ) : selectedQuiz ? (
                /* Active Quiz Player */
                <QuizPlayer
                  quiz={selectedQuiz}
                  videoTitle={folderName}
                  onBackToVideo={() => {
                    const matchedVideo = folderVideos.find(v => v.id === selectedQuiz.videoId);
                    if (matchedVideo) {
                      handleSelectVideoContent(matchedVideo.id);
                    } else if (folderVideos.length > 0) {
                      handleSelectVideoContent(folderVideos[0].id);
                    }
                  }}
                  onQuizComplete={() => {
                    // Update completed state in localstorage
                    const completed = JSON.parse(localStorage.getItem('summarix_completed_quizzes') || '[]');
                    if (!completed.includes(selectedQuiz._id)) {
                      completed.push(selectedQuiz._id);
                      localStorage.setItem('summarix_completed_quizzes', JSON.stringify(completed));
                      setCompletedQuizzes(completed);
                    }
                  }}
                />
              ) : (
                <div className="text-center text-gray-500 text-xs">No active assessment selected.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
