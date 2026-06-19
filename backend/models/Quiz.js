const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  catalogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalog', default: null },
  playlistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Playlist', default: null },
  questions: [{
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswerIdx: { type: Number, required: true }, // 0-based index
    explanation: { type: String, default: "" }
  }],
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', QuizSchema);
