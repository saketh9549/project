import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/api';
import QuizCreator from './QuizCreator';
import QuizPlayer from './QuizPlayer';

export default function QuizPage({ currentUser, showSuccess, showError, playlists = [] }) {
  const { id, playlistId, mode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = currentUser?.role === 'admin';
  const isCourseQuiz = !!playlistId;

  const [quiz, setQuiz] = useState(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [manualQuestions, setManualQuestions] = useState([]);
  const [uploadQuestions, setUploadQuestions] = useState([]);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [folderName, setFolderName] = useState('');
  const [videoPlaylistId, setVideoPlaylistId] = useState(null);
  const [nextVideo, setNextVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchQuizAndVideo = async () => {
    setLoading(true);
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';

      let fetchedTitle = 'Workspace Media';
      let resolvedFolderName = '';
      let quizUrl = '';
      let currentPlId = null;

      if (isCourseQuiz) {
        if (playlistId && Array.isArray(playlists)) {
          const folderObj = playlists.find(p => p && (p.id === playlistId || p._id === playlistId));
          if (folderObj) {
            fetchedTitle = `Course Final Assessment: ${folderObj.name}`;
            resolvedFolderName = folderObj.name;
          }
        }
        quizUrl = apiUrl(`/api/quizzes?playlist_id=${playlistId}`);
      } else {
        const videoRes = await fetch(apiUrl(`/api/videos/${id}?owner_email=${encodeURIComponent(email)}&role=${role}`));
        if (videoRes.ok) {
          const videoData = await videoRes.json();
          if (videoData.video) {
            fetchedTitle = videoData.video.file_name;
            const plId = videoData.video.playlist_id;
            setVideoPlaylistId(plId);
            currentPlId = plId;
            if (plId && Array.isArray(playlists)) {
              const folderObj = playlists.find(p => p && (p.id === plId || p._id === plId));
              if (folderObj) {
                resolvedFolderName = folderObj.name;
              }
            }
          }
        }
        quizUrl = apiUrl(`/api/quizzes?video_id=${id}`);
      }

      setVideoTitle(fetchedTitle);
      setFolderName(resolvedFolderName);

      // Fetch next video in playlist if applicable
      if (currentPlId && !isCourseQuiz) {
        try {
          const allVideosRes = await fetch(apiUrl(`/api/videos?owner_email=${encodeURIComponent(email)}&role=${role}`));
          if (allVideosRes.ok) {
            const allVideos = await allVideosRes.json();
            const playlistVideos = allVideos.filter(v => v && v.playlist_id === currentPlId && v.upload_status === 'indexed');
            const currentVideoIdx = playlistVideos.findIndex(v => v.id === id);
            if (currentVideoIdx !== -1 && currentVideoIdx < playlistVideos.length - 1) {
              setNextVideo(playlistVideos[currentVideoIdx + 1]);
            } else {
              setNextVideo(null);
            }
          }
        } catch (err) {
          console.error("Failed to load playlist videos for next navigation", err);
        }
      } else {
        setNextVideo(null);
      }

      // Fetch quiz details
      const quizRes = await fetch(quizUrl);
      if (quizRes.ok) {
        const quizData = await quizRes.json();
        setQuiz(quizData);
        setQuizTitle(quizData.title || `Quiz: ${fetchedTitle}`);
        setQuizDescription(quizData.description || '');
        setManualQuestions(quizData.questions || []);
      } else if (quizRes.status === 404) {
        setQuiz(null); // No quiz exists yet
        setQuizTitle(isCourseQuiz ? fetchedTitle : `Quiz: ${fetchedTitle}`);
        setQuizDescription('');
        setManualQuestions([]);
      } else {
        throw new Error('Failed to fetch quiz information');
      }
    } catch (err) {
      showError('Failed to load assessment data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id || playlistId) {
      fetchQuizAndVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, playlistId, currentUser, playlists]);

  // If a quiz already exists and no specific mode is chosen, redirect to the manual editor mode by default
  useEffect(() => {
    if ((id || playlistId) && !mode && quiz && !loading) {
      if (isCourseQuiz) {
        navigate(`/quiz/course/${playlistId}/manual`, { replace: true, state: location.state });
      } else {
        navigate(`/quiz/${id}/manual`, { replace: true, state: location.state });
      }
    }
  }, [id, playlistId, isCourseQuiz, mode, quiz, loading, navigate, location.state]);

  const handleSaveQuiz = async (updatedQuiz) => {
    try {
      showSuccess('Saving quiz to database...');
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const response = await fetch(apiUrl(`/api/quizzes?owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedQuiz.title,
          description: updatedQuiz.description,
          catalogId: isCourseQuiz ? null : id,
          playlistId: isCourseQuiz ? playlistId : videoPlaylistId,
          questions: updatedQuiz.questions
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to save quiz');

      showSuccess('Quiz saved successfully!');
      
      // Notify other views of the score updates
      window.dispatchEvent(new Event('summarix_quiz_scores_change'));

      // Redirect back
      if (isCourseQuiz) {
        navigate(`/course/${playlistId}`, { state: location.state });
      } else {
        navigate(`/video/${id}`, { state: location.state });
      }
    } catch (err) {
      showError('Save failed: ' + err.message);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!quiz || !quiz._id) return;
    if (!confirm('Are you sure you want to delete this entire quiz? This action is permanent.')) return;

    try {
      showSuccess('Deleting quiz...');
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const queryParam = isCourseQuiz ? `playlist_id=${playlistId}` : `video_id=${id}`;
      const response = await fetch(apiUrl(`/api/quizzes?${queryParam}&owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to delete quiz');

      showSuccess('Quiz deleted successfully.');
      
      // Notify other views of the score updates
      window.dispatchEvent(new Event('summarix_quiz_scores_change'));

      setQuiz(null);
      setManualQuestions([]);
      setUploadQuestions([]);
      setAiQuestions([]);
      setQuizTitle(isCourseQuiz ? `Course Final Assessment` : `Quiz: ${videoTitle}`);
      setQuizDescription('');
      
      // Go back to selection mode
      if (isCourseQuiz) {
        navigate(`/quiz/course/${playlistId}`, { state: location.state });
      } else {
        navigate(`/quiz/${id}`, { state: location.state });
      }
    } catch (err) {
      showError('Delete failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24">
        <svg className="animate-spin h-8 w-8 text-cyan-400 mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs text-gray-400">Loading quiz workspace...</span>
      </div>
    );
  }

  const backTarget = isCourseQuiz ? `/course/${playlistId}` : `/video/${id}`;

  // 1. User view: Player Mode
  if (!isAdmin) {
    if (!quiz) {
      return (
        <div className="flex-grow flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto my-auto animate-quiz-slide">
          <div className="h-16 w-16 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-lg">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold font-display text-white mb-2">No Quiz Available</h3>
          <p className="text-gray-400 text-xs leading-relaxed mb-6">
            An administrator has not created a final course assessment for <strong>{videoTitle}</strong> yet.
          </p>
          <button
            onClick={() => navigate(backTarget, { state: location.state })}
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold text-xs rounded-xl border border-white/5 shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Back to Course Syllabus
          </button>
        </div>
      );
    }

    return (
      <div className="flex-grow flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0 max-h-full h-full animate-quiz-slide">
        <QuizPlayer
          quiz={quiz}
          videoTitle={videoTitle}
          onBackToVideo={() => navigate(backTarget, { state: location.state })}
          nextVideoId={nextVideo?.id}
          nextVideoTitle={nextVideo?.file_name}
          isCourseQuiz={isCourseQuiz}
          currentUser={currentUser}
        />
      </div>
    );
  }

  // 2. Admin view: Creator Mode
  return (
    <div className="w-full animate-quiz-slide flex flex-col">
      <QuizCreator
        quiz={quiz}
        title={quizTitle}
        setTitle={setQuizTitle}
        description={quizDescription}
        setDescription={setQuizDescription}
        manualQuestions={manualQuestions}
        setManualQuestions={setManualQuestions}
        uploadQuestions={uploadQuestions}
        setUploadQuestions={setUploadQuestions}
        aiQuestions={aiQuestions}
        setAiQuestions={setAiQuestions}
        videoTitle={videoTitle}
        folderName={folderName}
        onSave={handleSaveQuiz}
        onDelete={handleDeleteQuiz}
        onBack={() => navigate(backTarget, { state: location.state })}
        catalogId={isCourseQuiz ? null : id}
        playlistId={isCourseQuiz ? playlistId : videoPlaylistId}
        onReload={fetchQuizAndVideo}
        currentUser={currentUser}
        mode={mode}
      />
    </div>
  );
}
