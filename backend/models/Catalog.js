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
      values: [
        'pending', 'uploaded', 'indexing', 'indexed', 'failed',
        'Extracting Audio (15%)', 'Transcribing Audio (45%)', 'Summarizing',
        'failed_uploading', 'failed_extracting', 'failed_indexing', 'failed_summarizing'
      ],
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
  },
  absoluteLocalPath: {
    type: String,
    trim: true,
    default: ''
  },
  gridFsFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'fs.files',
    default: null
  },
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist',
    default: null
  },
  s3Key: {
    type: String,
    trim: true,
    default: ''
  },
  s3Bucket: {
    type: String,
    trim: true,
    default: ''
  },
  timelineIndex: [{
    timestamp: { type: String, trim: true },
    title: { type: String, trim: true },
    seconds: { type: Number }
  }]
}, {
  timestamps: true
});

// Single field index for fast owner queries
catalogSchema.index({ ownerEmail: 1 });
catalogSchema.index({ 'timelineIndex.seconds': 1 });

const Catalog = mongoose.model('Catalog', catalogSchema);
module.exports = Catalog;
