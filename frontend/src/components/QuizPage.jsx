import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/api';
import QuizCreator from './QuizCreator';
import QuizPlayer from './QuizPlayer';

export default function QuizPage({ currentUser, showSuccess, showError }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';

  const [quiz, setQuiz] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchQuizAndVideo = async () => {
    setLoading(true);
    try {
      // 1. Fetch video metadata to display title
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const videoRes = await fetch(apiUrl(`/api/videos/${id}?owner_email=${encodeURIComponent(email)}&role=${role}`));
      let fetchedTitle = 'Workspace Media';
      if (videoRes.ok) {
        const videoData = await videoRes.json();
        if (videoData.video) {
          fetchedTitle = videoData.video.file_name;
        }
      }
      setVideoTitle(fetchedTitle);

      // 2. Fetch quiz details
      const quizRes = await fetch(apiUrl(`/api/quizzes?video_id=${id}`));
      if (quizRes.ok) {
        const quizData = await quizRes.json();
        setQuiz(quizData);
      } else if (quizRes.status === 404) {
        setQuiz(null); // No quiz exists yet
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
    if (id) {
      fetchQuizAndVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentUser]);

  const handleSaveQuiz = async (updatedQuiz) => {
    try {
      showSuccess('Saving quiz to database...');
      const response = await fetch(apiUrl('/api/quizzes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedQuiz.title,
          catalogId: id,
          questions: updatedQuiz.questions
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to save quiz');

      showSuccess('Quiz saved successfully!');
      // Redirect back to the video workspace
      navigate(`/video/${id}`);
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
      const response = await fetch(apiUrl(`/api/quizzes?video_id=${id}&owner_email=${encodeURIComponent(email)}&role=${role}`), {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to delete quiz');

      showSuccess('Quiz deleted successfully.');
      setQuiz(null);
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
            An administrator has not created a multiple-choice practice quiz for <strong>{videoTitle}</strong> yet.
          </p>
          <button
            onClick={() => navigate(`/video/${id}`)}
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold text-xs rounded-xl border border-white/5 shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Back to Workspace
          </button>
        </div>
      );
    }

    return (
      <div className="flex-grow flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0 max-h-full h-full animate-quiz-slide">
        <QuizPlayer
          quiz={quiz}
          videoTitle={videoTitle}
          onBackToVideo={() => navigate(`/video/${id}`)}
        />
      </div>
    );
  }

  // 2. Admin view: Creator Mode
  return (
    <div className="flex-grow flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0 max-h-full h-full animate-quiz-slide">
      <QuizCreator
        quiz={quiz}
        videoTitle={videoTitle}
        onSave={handleSaveQuiz}
        onDelete={handleDeleteQuiz}
        onBack={() => navigate(`/video/${id}`)}
        catalogId={id}
        onReload={fetchQuizAndVideo}
      />
    </div>
  );
}
