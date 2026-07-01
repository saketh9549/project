import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/api';

export default function QuizCreator({
  quiz,
  title,
  setTitle,
  description,
  setDescription,
  manualQuestions,
  setManualQuestions,
  uploadQuestions,
  setUploadQuestions,
  aiQuestions,
  setAiQuestions,
  videoTitle,
  folderName,
  onSave,
  onDelete,
  onBack,
  catalogId,
  onReload,
  currentUser,
  mode
}) {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Inline display state for adding a new question in Manual Mode
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  // Form state for Manual Mode (adding/editing questions)
  const [currentIdx, setCurrentIdx] = useState(null);
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswerIdx, setCorrectAnswerIdx] = useState(0);
  const [explanation, setExplanation] = useState('');

  // Config state for Gemini AI Mode
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('Medium');
  const [focusTopics, setFocusTopics] = useState('');

  // Active guide tab for Upload View formatting examples
  const [activeGuideTab, setActiveGuideTab] = useState('txt');

  const handleAddOrUpdateQuestion = (e) => {
    e.preventDefault();
    if (!questionText.trim()) return alert('Please enter question text');
    if (options.some(opt => !opt.trim())) return alert('Please fill in all four options');

    const questionData = {
      questionText: questionText.trim(),
      options: options.map(o => o.trim()),
      correctAnswerIdx,
      explanation: explanation.trim()
    };

    if (currentIdx === null) {
      if (mode === 'manual') setManualQuestions([...manualQuestions, questionData]);
      else if (mode === 'upload') setUploadQuestions([...uploadQuestions, questionData]);
      else if (mode === 'ai') setAiQuestions([...aiQuestions, questionData]);
      setIsAddingQuestion(false);
    } else {
      if (mode === 'manual') {
        const updated = [...manualQuestions];
        updated[currentIdx] = questionData;
        setManualQuestions(updated);
      } else if (mode === 'upload') {
        const updated = [...uploadQuestions];
        updated[currentIdx] = questionData;
        setUploadQuestions(updated);
      } else if (mode === 'ai') {
        const updated = [...aiQuestions];
        updated[currentIdx] = questionData;
        setAiQuestions(updated);
      }
      setCurrentIdx(null);
    }

    resetForm();
  };

  const resetForm = () => {
    setCurrentIdx(null);
    setQuestionText('');
    setOptions(['', '', '', '']);
    setCorrectAnswerIdx(0);
    setExplanation('');
  };

  const handleEditQuestion = (idx) => {
    setIsAddingQuestion(false);
    let q;
    if (mode === 'manual') q = manualQuestions[idx];
    else if (mode === 'upload') q = uploadQuestions[idx];
    else if (mode === 'ai') q = aiQuestions[idx];

    if (!q) return;
    setCurrentIdx(idx);
    setQuestionText(q.questionText);
    setOptions([...q.options]);
    setCorrectAnswerIdx(q.correctAnswerIdx);
    setExplanation(q.explanation || '');
  };

  const handleDeleteQuestion = (idx) => {
    if (confirm('Are you sure you want to delete this question?')) {
      setManualQuestions(manualQuestions.filter((_, i) => i !== idx));
      if (currentIdx === idx) {
        resetForm();
      } else if (currentIdx !== null && currentIdx > idx) {
        setCurrentIdx(currentIdx - 1);
      }
    }
  };

  const handleDeleteAiQuestion = (idx) => {
    if (confirm('Are you sure you want to delete this question?')) {
      setAiQuestions(aiQuestions.filter((_, i) => i !== idx));
      if (currentIdx === idx) {
        resetForm();
      } else if (currentIdx !== null && currentIdx > idx) {
        setCurrentIdx(currentIdx - 1);
      }
    }
  };

  const handleDeleteUploadQuestion = (idx) => {
    if (confirm('Are you sure you want to delete this question?')) {
      setUploadQuestions(uploadQuestions.filter((_, i) => i !== idx));
      if (currentIdx === idx) {
        resetForm();
      } else if (currentIdx !== null && currentIdx > idx) {
        setCurrentIdx(currentIdx - 1);
      }
    }
  };

  const handleSave = () => {
    let targetQuestions = [];
    if (mode === 'manual') targetQuestions = manualQuestions;
    else if (mode === 'upload') targetQuestions = uploadQuestions;
    else if (mode === 'ai') targetQuestions = aiQuestions;

    if (targetQuestions.length === 0) {
      return alert('Please add at least one question before saving the quiz.');
    }
    onSave({
      title: title.trim() || `Quiz: ${videoTitle}`,
      description: description.trim(),
      questions: targetQuestions
    });
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = apiUrl(`/api/quizzes/upload?catalog_id=${catalogId}`);
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to upload and parse document.');
      }
      alert(`Quiz successfully imported with ${data.questions.length} questions!`);
      
      if (data.title) setTitle(data.title);
      if (data.questions) setUploadQuestions(data.questions);
    } catch (err) {
      alert('Error parsing quiz: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setGenerating(true);
    try {
      const email = currentUser?.email || 'anonymous@summarix.io';
      const role = currentUser?.role || 'user';
      const url = apiUrl(
        `/api/quizzes/generate?catalog_id=${catalogId}&owner_email=${encodeURIComponent(
          email
        )}&role=${role}&num_questions=${numQuestions}&difficulty=${difficulty}&focus_topics=${encodeURIComponent(
          focusTopics
        )}`
      );
      const response = await fetch(url, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to generate quiz.');
      }
      alert(`Quiz successfully generated with ${data.questions.length} questions!`);
      
      if (data.title) setTitle(data.title);
      if (data.questions) setAiQuestions(data.questions);
    } catch (err) {
      alert('Error generating quiz: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const activeTabClass = (tabMode) =>
    `px-4 py-2.5 text-xs font-bold tracking-wide rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-1.5 select-none ${
      mode === tabMode
        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 font-bold shadow-[0_0_12px_rgba(99,102,241,0.12)]'
        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
    }`;

  const getActiveQuestionsCount = () => {
    if (mode === 'manual') return manualQuestions.length;
    if (mode === 'upload') return uploadQuestions.length;
    if (mode === 'ai') return aiQuestions.length;
    return 0;
  };

  const renderQuestionEditor = (idx) => {
    const isEditMode = idx !== null;
    return (
      <div className="bg-white/5 border border-indigo-500/30 rounded-2xl p-5 flex flex-col gap-4 transition-all">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-display">
            {isEditMode ? `Editing Question #${idx + 1}` : "New Question"}
          </span>
        </div>

        {/* Question Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Question Text</label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows={2}
            className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold resize-none placeholder-gray-700"
            placeholder="Write the multiple choice question here..."
          />
        </div>

        {/* Options Grid */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Options & Correct Key</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {options.map((opt, oIdx) => (
              <div
                key={oIdx}
                className={`px-4 py-2 rounded-xl border flex items-center gap-3 transition-all ${
                  correctAnswerIdx === oIdx
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-black/20 border-white/5 text-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name={`correct-option-${idx ?? 'new'}`}
                  checked={correctAnswerIdx === oIdx}
                  onChange={() => setCorrectAnswerIdx(oIdx)}
                  className="h-4.5 w-4.5 text-emerald-600 focus:ring-emerald-500 border-gray-600 bg-gray-900/40 cursor-pointer shrink-0"
                />
                <span className="text-[10px] font-bold font-mono">
                  {String.fromCharCode(65 + oIdx)}
                </span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const updated = [...options];
                    updated[oIdx] = e.target.value;
                    setOptions(updated);
                  }}
                  className="flex-grow bg-transparent border-none p-0 text-xs text-white focus:outline-none focus:ring-0 placeholder-gray-700 font-medium"
                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}...`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Explanation */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Gemini / Contextual Explanation</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={1.5}
            className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none placeholder-gray-700"
            placeholder="Provide explanation showing why the answer is correct..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => {
              resetForm();
              if (isEditMode) {
                setCurrentIdx(null);
              } else {
                setIsAddingQuestion(false);
              }
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold rounded-xl cursor-pointer transition-all border border-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAddOrUpdateQuestion}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10"
          >
            {isEditMode ? 'Update Question' : 'Add Question'}
          </button>
        </div>
      </div>
    );
  };

  // RENDER SELECTOR/LANDING SCREEN (if no mode is specified)
  if (!mode) {
    return (
      <div className="flex-grow flex-1 flex flex-col justify-center items-center p-6 w-full animate-quiz-slide max-w-5xl mx-auto my-auto min-h-[80vh]">
        <div className="text-center mb-10">
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4 font-mono shadow-[0_0_10px_rgba(99,102,241,0.05)]">
            📁 {folderName || videoTitle}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: Manual Question Builder */}
          <div
            onClick={() => navigate(`/quiz/${catalogId}/manual`)}
            className="group glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-indigo-950/20 via-slate-900/10 to-indigo-950/5 hover:border-indigo-500/30 hover:shadow-indigo-500/5 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="font-extrabold text-base text-white tracking-tight font-display mb-2">Manual Builder</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-6">
                Compose quiz questions manually. Enter question prompts, define four options, pick the correct answer, and add customized explanations.
              </p>
            </div>
            <button className="w-full py-2 bg-indigo-600/10 group-hover:bg-indigo-600 border border-indigo-500/20 group-hover:border-transparent text-indigo-400 group-hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer">
              Open Manual Editor
            </button>
          </div>

          {/* Card 2: Document File Import */}
          <div
            onClick={() => navigate(`/quiz/${catalogId}/upload`)}
            className="group glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-emerald-950/20 via-slate-900/10 to-emerald-950/5 hover:border-emerald-500/30 hover:shadow-emerald-500/5 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="font-extrabold text-base text-white tracking-tight font-display mb-2">Document Import</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-6">
                Import and parse existing quiz files. Supports PDF, DOCX, TXT, CSV, or structured JSON file formats.
              </p>
            </div>
            <button className="w-full py-2 bg-emerald-600/10 group-hover:bg-emerald-600 border border-emerald-500/20 group-hover:border-transparent text-indigo-400 group-hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer">
              Upload Quiz File
            </button>
          </div>

          {/* Card 3: Generate with Gemini AI */}
          <div
            onClick={() => navigate(`/quiz/${catalogId}/ai`)}
            className="group glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-cyan-950/20 via-slate-900/10 to-cyan-950/5 hover:border-cyan-500/30 hover:shadow-cyan-500/5 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-all">
                <span className="text-xl">✨</span>
              </div>
              <h3 className="font-extrabold text-base text-white tracking-tight font-display mb-2">Gemini AI Generator</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-6">
                Let Google Gemini AI read the video transcript to instantly generate a complete 5-20 question quiz with keys and explanations.
              </p>
            </div>
            <button className="w-full py-2 bg-cyan-600/10 group-hover:bg-cyan-600 border border-cyan-500/20 group-hover:border-transparent text-indigo-400 group-hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer">
              Configure Gemini AI
            </button>
          </div>
        </div>

        <button
          onClick={onBack}
          className="mt-12 px-5 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 hover:border-white/10 text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          &larr; Back to Workspace
        </button>
      </div>
    );
  }

  // RENDER DETAILED MODE WORKSPACE (Manual, Upload, or AI)
  return (
    <div className="flex flex-col gap-6 p-6 w-full animate-quiz-slide">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/quiz/${catalogId}`)}
            className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group"
            title="Go back to method selection"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="font-bold text-lg text-white font-display">Quiz Creator Console</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]" title={videoTitle}>
              Media: {videoTitle}
            </p>
          </div>
        </div>

        {/* Tab switch navigation */}
        <div className="flex bg-white/5 border border-white/5 p-1 rounded-2xl max-w-fit md:mx-auto">
          <div onClick={() => navigate(`/quiz/${catalogId}/manual`)} className={activeTabClass('manual')}>
            <span>✏️</span> Manual Creator
          </div>
          <div onClick={() => navigate(`/quiz/${catalogId}/upload`)} className={activeTabClass('upload')}>
            <span>📁</span> Document Import
          </div>
          <div onClick={() => navigate(`/quiz/${catalogId}/ai`)} className={activeTabClass('ai')}>
            <span>✨</span> Gemini AI
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quiz && (
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-all cursor-pointer border border-white/5"
              title="Delete Entire Quiz"
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={getActiveQuestionsCount() === 0}
            className={`px-5 py-2.5 font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md ${
              getActiveQuestionsCount() === 0
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-indigo-500/10'
            }`}
          >
            Save Quiz
          </button>
        </div>
      </div>


      {/* Mode Specific Layouts */}
      {mode === 'manual' && (
        <div className="flex flex-col gap-6 w-full">
          {/* Top section: Standalone add question button */}
          <div className="flex justify-end w-full">
            <button
              onClick={() => {
                setCurrentIdx(null);
                resetForm();
                setIsAddingQuestion(true);
              }}
              disabled={isAddingQuestion}
              className={`px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10 flex items-center gap-1.5 ${
                isAddingQuestion ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Add Question
            </button>
          </div>

          {/* Bottom section: Full-width list of questions */}
          <div className="flex flex-col gap-4 w-full">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2 flex items-center justify-between shrink-0">
              <span>Questions List</span>
              <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded-full">
                {manualQuestions.length} Items
              </span>
            </h4>

            <div className="flex flex-col gap-4 w-full">
              {manualQuestions.length === 0 && !isAddingQuestion ? (
                <div className="text-center text-gray-500 text-xs font-mono py-24 bg-white/2 rounded-2xl border border-dashed border-white/5 my-auto">
                  No questions added yet. Click "Add Question" at the top to write your first question.
                </div>
              ) : (
                <>
                  {manualQuestions.map((q, idx) => (
                    <div key={idx} className="animate-quiz-slide">
                      {currentIdx === idx ? (
                        renderQuestionEditor(idx)
                      ) : (
                        /* Standard question card layout - exact format like 2nd image */
                        <div className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:bg-white/[0.07]">
                          <div className="flex items-start justify-between gap-4 w-full">
                            <p className="font-bold text-sm text-white leading-relaxed">
                              {idx + 1}. {q.questionText}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleEditQuestion(idx)}
                                className="px-3 py-1.5 bg-white/5 hover:bg-indigo-500/20 border border-white/5 text-gray-400 hover:text-indigo-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                                title="Edit Question"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(idx)}
                                className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 border border-white/5 text-gray-400 hover:text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                                title="Delete Question"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs w-full">
                            {q.options.map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className={`px-4 py-2.5 rounded-xl truncate border flex items-center gap-2 ${
                                  q.correctAnswerIdx === oIdx
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.05)]'
                                    : 'bg-black/20 border-white/5 text-gray-400'
                                }`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                                  q.correctAnswerIdx === oIdx ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500'
                                }`}>
                                  {String.fromCharCode(65 + oIdx)}
                                </span>
                                {opt}
                              </div>
                            ))}
                          </div>

                          {q.explanation && (
                            <p className="text-xs text-indigo-300/80 mt-1 font-medium bg-indigo-500/5 px-3 py-2 rounded-xl border border-indigo-500/5 flex items-start gap-1.5 w-full">
                              <span className="shrink-0">💡</span>
                              <span>{q.explanation}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* If isAddingQuestion is true, show form at the bottom of the questions list */}
                  {isAddingQuestion && (
                    <div className="animate-quiz-slide">
                      {renderQuestionEditor(null)}
                    </div>
                  )}

                  {/* Add Question button at the bottom of the list */}
                  <div className="flex justify-end w-full mt-4">
                    <button
                      onClick={() => {
                        setCurrentIdx(null);
                        resetForm();
                        setIsAddingQuestion(true);
                      }}
                      disabled={isAddingQuestion}
                      className={`px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10 flex items-center gap-1.5 ${
                        isAddingQuestion ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Question
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div className="flex flex-col gap-6 w-full animate-quiz-slide">
          {/* Dropzone Side */}
          <div className="flex flex-col gap-4 w-full">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2">
              Upload Quiz Document
            </h4>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  await handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className="border border-dashed rounded-2xl p-5 text-center flex flex-col justify-center items-center transition-all border-white/10 bg-white/2 hover:border-white/20 min-h-[160px]"
            >
              <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-md">
                  {uploading ? (
                    <svg className="animate-spin h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-sm text-white">Drag and Drop Document</h3>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                    Drop your quiz file here, or click browse to import.
                  </p>
                </div>

                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="file"
                    id="quiz-file-upload-mode"
                    className="hidden"
                    accept=".txt,.pdf,.docx,.json,.csv"
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        await handleFileUpload(e.target.files[0]);
                      }
                    }}
                    disabled={uploading}
                  />

                  <label
                    htmlFor="quiz-file-upload-mode"
                    className="px-4.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10"
                  >
                    {uploading ? 'Processing...' : 'Browse File'}
                  </label>

                  <div className="flex gap-1.5">
                    {['PDF', 'DOCX', 'TXT', 'CSV', 'JSON'].map((format) => (
                      <span
                        key={format}
                        className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-semibold text-gray-400"
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Guidelines / Preview Side */}
          <div className="flex flex-col gap-4 w-full">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2 flex items-center justify-between shrink-0">
              <span>{uploadQuestions.length > 0 ? 'Imported Questions Preview' : 'Document Formatting Guide'}</span>
              {uploadQuestions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    {uploadQuestions.length} Questions Parsed
                  </span>
                </div>
              )}
            </h4>

            {uploadQuestions.length > 0 ? (
              <div className="flex flex-col gap-3 w-full">
                {uploadQuestions.map((q, idx) => (
                  <div key={idx} className="animate-quiz-slide">
                    {currentIdx === idx ? (
                      renderQuestionEditor(idx)
                    ) : (
                      <div className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:bg-white/[0.07]">
                        <div className="flex items-start justify-between gap-4 w-full">
                          <p className="font-bold text-sm text-white leading-relaxed">
                            {idx + 1}. {q.questionText}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleEditQuestion(idx)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-indigo-500/20 border border-white/5 text-gray-400 hover:text-indigo-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              title="Edit Question"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUploadQuestion(idx)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 border border-white/5 text-gray-400 hover:text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              title="Delete Question"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs w-full">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-4 py-2.5 rounded-xl truncate border flex items-center gap-2 ${
                                q.correctAnswerIdx === oIdx
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.05)]'
                                  : 'bg-black/20 border-white/5 text-gray-400'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                                q.correctAnswerIdx === oIdx ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500'
                              }`}>
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              {opt}
                            </div>
                          ))}
                        </div>

                        {q.explanation && (
                          <p className="text-xs text-indigo-300/80 mt-1 font-medium bg-indigo-500/5 px-3 py-2 rounded-xl border border-indigo-500/5 flex items-start gap-1.5 w-full">
                            <span className="shrink-0">💡</span>
                            <span>{q.explanation}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/2 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 w-full">
                <div className="flex border-b border-white/5 pb-2 gap-3">
                  <span
                    onClick={() => setActiveGuideTab('txt')}
                    className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer pb-1 border-b-2 ${
                      activeGuideTab === 'txt' ? 'text-indigo-400 border-indigo-400' : 'text-gray-500 border-transparent hover:text-gray-300'
                    }`}
                  >
                    Plain Text
                  </span>
                  <span
                    onClick={() => setActiveGuideTab('csv')}
                    className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer pb-1 border-b-2 ${
                      activeGuideTab === 'csv' ? 'text-indigo-400 border-indigo-400' : 'text-gray-500 border-transparent hover:text-gray-300'
                    }`}
                  >
                    CSV File
                  </span>
                  <span
                    onClick={() => setActiveGuideTab('json')}
                    className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer pb-1 border-b-2 ${
                      activeGuideTab === 'json' ? 'text-indigo-400 border-indigo-400' : 'text-gray-500 border-transparent hover:text-gray-300'
                    }`}
                  >
                    Structured JSON
                  </span>
                </div>

                {activeGuideTab === 'txt' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Use standard formatting for quizzes in plain text or PDF files. Gemini will extract questions and options:
                    </p>
                    <pre className="bg-black/40 border border-white/5 rounded-xl p-3.5 text-[10px] font-mono text-gray-300 overflow-x-auto leading-relaxed">
{`1. What is the default port for React?
A) 3000
B) 5000
C) 5173
D) 8080
Correct: C
Explanation: Vite's default dev server port is 5173.`}
                    </pre>
                  </div>
                )}

                {activeGuideTab === 'csv' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Your CSV sheet should contain headers for question text, the four choices, the correct key (or 0-3 index), and explanation:
                    </p>
                    <pre className="bg-black/40 border border-white/5 rounded-xl p-3.5 text-[10px] font-mono text-gray-300 overflow-x-auto leading-relaxed">
{`Question,Option A,Option B,Option C,Option D,Correct,Explanation
"What is Python?","Snake","Language","OS","Database",B,"Python is a programming language."`}
                    </pre>
                  </div>
                )}

                {activeGuideTab === 'json' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Provide a JSON array representing the quiz questions schema:
                    </p>
                    <pre className="bg-black/40 border border-white/5 rounded-xl p-3.5 text-[10px] font-mono text-gray-300 overflow-x-auto leading-relaxed">
{`[
  {
    "questionText": "What is Python?",
    "options": ["A snake", "A programming language", "OS", "DB"],
    "correctAnswerIdx": 1,
    "explanation": "Python is a high-level general-purpose language."
  }
]`}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'ai' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full animate-quiz-slide">
          {/* AI Settings Side */}
          <div className="lg:col-span-5 flex flex-col gap-5 w-full">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2">
              Gemini Quiz Configurator
            </h4>

            {/* Config inputs */}
            <div className="flex flex-col gap-4 bg-white/5 border border-white/5 rounded-2xl p-5">
              {/* Question count */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Number of Questions</label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((val) => (
                    <div
                      key={val}
                      onClick={() => setNumQuestions(val)}
                      className={`py-2 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer select-none ${
                        numQuestions === val
                          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)]'
                          : 'bg-black/20 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Difficulty Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Easy', 'Medium', 'Hard'].map((diff) => (
                    <div
                      key={diff}
                      onClick={() => setDifficulty(diff)}
                      className={`py-2 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer select-none ${
                        difficulty === diff
                          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)]'
                          : 'bg-black/20 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {diff}
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom instructions / Focus topics */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Topics to Focus On</label>
                <textarea
                  value={focusTopics}
                  onChange={(e) => setFocusTopics(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all resize-none placeholder-gray-700"
                  placeholder="Optional guidelines (e.g. Focus on chapter 3, include tricky questions on data structures)..."
                />
              </div>

              {/* Generator trigger button */}
              <button
                onClick={handleGenerateQuiz}
                disabled={generating || uploading}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-cyan-500/10 flex items-center justify-center gap-2 mt-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating Quiz...
                  </>
                ) : (
                  <>
                    <span>✨</span> Generate Quiz with Gemini
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results preview side */}
          <div className="lg:col-span-7 flex flex-col gap-4 w-full">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2 flex items-center justify-between shrink-0">
              <span>Preview AI Generated Quiz</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/10 px-2 py-0.5 rounded-full">
                {generating ? 'AI Thinking...' : `${aiQuestions.length} Questions`}
              </span>
            </h4>

            <div className="flex flex-col gap-3 w-full">
              {generating ? (
                /* Animated loading skeletons for generated questions */
                <div className="flex flex-col gap-4 w-full">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3 animate-pulse">
                      <div className="h-4 bg-white/10 rounded w-3/4"></div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="h-7 bg-white/5 rounded-lg w-full"></div>
                        <div className="h-7 bg-white/5 rounded-lg w-full"></div>
                        <div className="h-7 bg-white/5 rounded-lg w-full"></div>
                        <div className="h-7 bg-white/5 rounded-lg w-full"></div>
                      </div>
                      <div className="h-6 bg-white/5 rounded-lg w-full mt-1"></div>
                    </div>
                  ))}
                </div>
              ) : aiQuestions.length === 0 ? (
                <div className="text-center text-gray-500 text-xs font-mono py-24 bg-white/2 rounded-2xl border border-dashed border-white/5 my-auto">
                  Configure AI settings on the left and click Generate to see questions.
                </div>
              ) : (
                aiQuestions.map((q, idx) => (
                  <div key={idx} className="animate-quiz-slide">
                    {currentIdx === idx ? (
                      renderQuestionEditor(idx)
                    ) : (
                      <div className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:bg-white/[0.07]">
                        <div className="flex items-start justify-between gap-4 w-full">
                          <p className="font-bold text-sm text-white leading-relaxed">
                            {idx + 1}. {q.questionText}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleEditQuestion(idx)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-indigo-500/20 border border-white/5 text-gray-400 hover:text-indigo-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              title="Edit Question"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteAiQuestion(idx)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 border border-white/5 text-gray-400 hover:text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              title="Delete Question"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs w-full">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-4 py-2.5 rounded-xl truncate border flex items-center gap-2 ${
                                q.correctAnswerIdx === oIdx
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.05)]'
                                  : 'bg-black/20 border-white/5 text-gray-400'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                                q.correctAnswerIdx === oIdx ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500'
                              }`}>
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              {opt}
                            </div>
                          ))}
                        </div>

                        {q.explanation && (
                          <p className="text-xs text-indigo-300/80 mt-1 font-medium bg-indigo-500/5 px-3 py-2 rounded-xl border border-indigo-500/5 flex items-start gap-1.5 w-full">
                            <span className="shrink-0">💡</span>
                            <span>{q.explanation}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
