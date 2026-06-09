const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  catalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Catalog',
    required: [true, 'Reference to Catalog is required']
  },
  indexId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Index',
    required: [true, 'Reference to Index is required']
  },
  rawTextChunk: {
    type: String,
    required: [true, 'Raw text chunk is required'],
    trim: true
  },
  summaryText: {
    type: String,
    required: [true, 'Summary text is required'],
    trim: true
  },
  bulletPoints: {
    type: [String],
    default: []
  },
  cachedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// A specific index item has exactly one summary document (unique constraint)
summarySchema.index({ catalogId: 1, indexId: 1 }, { unique: true });

const Summary = mongoose.model('Summary', summarySchema);
module.exports = Summary;
