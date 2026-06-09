const mongoose = require('mongoose');

const catalogSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  fileType: {
    type: String,
    required: [true, 'File type is required'], // e.g. 'video', 'audio', 'mp3', 'mp4'
    trim: true
  },
  filePath: {
    type: String,
    required: [true, 'File path is required'],
    unique: true,
    trim: true
  },
  duration: {
    type: Number,
    required: [true, 'Duration in seconds is required'],
    min: [0, 'Duration cannot be negative']
  },
  uploadStatus: {
    type: String,
    enum: {
      values: ['pending', 'uploaded', 'indexing', 'indexed', 'failed'],
      message: '{VALUE} is not a valid upload status'
    },
    default: 'pending'
  },
  history: {
    type: [String], // Array of history logs/audit trail events
    default: []
  },
  ownerEmail: {
    type: String,
    required: [true, 'Owner email is required'],
    trim: true,
    lowercase: true
  },
  rawTranscript: {
    type: String,
    default: ''
  },
  overallSummary: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Single field index for fast owner queries
catalogSchema.index({ ownerEmail: 1 });

const Catalog = mongoose.model('Catalog', catalogSchema);
module.exports = Catalog;
