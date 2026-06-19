import { useState } from 'react';

export default function QuizCreator({ quiz, videoTitle, onSave, onDelete, onBack, onTogglePreview }) {
  const [title, setTitle] = useState(quiz?.title || `Quiz: ${videoTitle}`);
  const [questions, setQuestions] = useState(quiz?.questions || []);

  // Form state for a new / editing question
  const [currentIdx, setCurrentIdx] = useState(null); // null means adding a new question, number means editing index
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswerIdx, setCorrectAnswerIdx] = useState(0);
  const [explanation, setExplanation] = useState('');

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
      setQuestions([...questions, questionData]);
    } else {
      const updated = [...questions];
      updated[currentIdx] = questionData;
      setQuestions(updated);
    }

    // Reset form
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
    const q = questions[idx];
    setCurrentIdx(idx);
    setQuestionText(q.questionText);
    setOptions([...q.options]);
    setCorrectAnswerIdx(q.correctAnswerIdx);
    setExplanation(q.explanation || '');
  };

  const handleDeleteQuestion = (idx) => {
    if (confirm('Are you sure you want to delete this question?')) {
      setQuestions(questions.filter((_, i) => i !== idx));
      if (currentIdx === idx) {
        resetForm();
      } else if (currentIdx !== null && currentIdx > idx) {
        setCurrentIdx(currentIdx - 1);
      }
    }
  };

  const handleSave = () => {
    if (questions.length === 0) {
      return alert('Please add at least one question before saving the quiz.');
    }
    onSave({
      title: title.trim() || `Quiz: ${videoTitle}`,
      questions
    });
  };

  return (
    <div className="flex-grow flex-1 flex flex-col gap-6 p-6 glass-panel rounded-2xl border border-white/5 shadow-2xl min-h-0 overflow-y-auto">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer group"
            title="Go back to workspace"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="font-bold text-lg text-white font-display">Quiz Creator Console</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]" title={videoTitle}>
              Media: {videoTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quiz && (
            <button
              onClick={onTogglePreview}
              className="px-3.5 py-1.5 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-950/40 border border-cyan-500/20 font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
            >
              Preview Player
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10"
          >
            Save Quiz
          </button>
          {quiz && (
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
              title="Delete Entire Quiz"
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Left Side: Create/Edit Form */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quiz Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
              placeholder="Quiz title..."
            />
          </div>

          <form onSubmit={handleAddOrUpdateQuestion} className="bg-white/5 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-display border-b border-white/5 pb-2">
              {currentIdx === null ? 'Add Question' : `Editing Question #${currentIdx + 1}`}
            </h4>

            {/* Question Text */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Question text</label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={2}
                className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none placeholder-gray-700"
                placeholder="Write the multiple choice question here..."
              />
            </div>

            {/* Multiple Choice Options */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Answer Options & Correct Key</label>
              {options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={correctAnswerIdx === oIdx}
                    onChange={() => setCorrectAnswerIdx(oIdx)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 bg-gray-900/40 cursor-pointer shrink-0"
                    title="Mark as correct answer"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const updated = [...options];
                      updated[oIdx] = e.target.value;
                      setOptions(updated);
                    }}
                    className="flex-grow bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder-gray-700"
                    placeholder={`Option ${String.fromCharCode(65 + oIdx)}...`}
                  />
                </div>
              ))}
            </div>

            {/* Explanation box */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Gemini / Contextual Explanation</label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                rows={2}
                className="w-full bg-gray-900/40 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none placeholder-gray-700"
                placeholder="Provide explanation showing why the answer is correct..."
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 mt-2">
              {currentIdx !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-1.5 bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold rounded-lg cursor-pointer transition-all"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.98]"
              >
                {currentIdx === null ? 'Add Question' : 'Update Question'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Questions List preview */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-display border-b border-white/5 pb-2 flex items-center justify-between">
            <span>Questions List</span>
            <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded-full">
              {questions.length} Items
            </span>
          </h4>

          <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3 max-h-[500px]">
            {questions.length === 0 ? (
              <div className="text-center text-gray-500 text-xs font-mono py-16 bg-white/2 rounded-xl border border-dashed border-white/5">
                No questions added.
              </div>
            ) : (
              questions.map((q, idx) => (
                <div
                  key={idx}
                  className={`bg-white/5 border rounded-xl p-3.5 flex items-start justify-between gap-3 transition-all ${
                    currentIdx === idx
                      ? 'border-indigo-500 bg-indigo-950/10 shadow-[0_0_10px_rgba(99,102,241,0.08)]'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-white">
                      {idx + 1}. {q.questionText}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px]">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className={`px-2 py-1 rounded truncate border ${
                            q.correctAnswerIdx === oIdx
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold'
                              : 'bg-black/20 border-white/5 text-gray-400'
                          }`}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <p className="text-[9px] text-indigo-300 mt-2 font-medium line-clamp-1">
                        💡 {q.explanation}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEditQuestion(idx)}
                      className="p-1 text-gray-500 hover:text-indigo-400 rounded hover:bg-white/5 transition-colors cursor-pointer"
                      title="Edit Question"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(idx)}
                      className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer"
                      title="Delete Question"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
