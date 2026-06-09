const mongoose = require('mongoose');

const indexSchema = new mongoose.Schema({
  catalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Catalog',
    required: [true, 'Reference to Catalog is required']
  },
  startTime: {
    type: Number,
    required: [true, 'Start time in seconds is required'],
    min: [0, 'Start time cannot be negative']
  },
  endTime: {
    type: Number,
    required: [true, 'End time in seconds is required'],
    min: [0, 'End time cannot be negative']
  },
  topicTitle: {
    type: String,
    required: [true, 'Topic title is required'],
    trim: true,
    default: 'Section'
  },
  text: {
    type: String,
    required: [true, 'Transcript text content is required'],
    trim: true
  },
  status: {
    type: String,
    enum: {
      values: ['raw', 'summarized', 'failed'],
      message: '{VALUE} is not a valid index status'
    },
    default: 'raw'
  }
}, {
  timestamps: true
});

// Compound index for fast chronological sorting within a specific video catalog
indexSchema.index({ catalogId: 1, startTime: 1 });

// Pre-save validation: Ensure endTime is after startTime
indexSchema.pre('save', function (next) {
  if (this.endTime <= this.startTime) {
    return next(new Error('End time must be strictly greater than start time'));
  }
  next();
});

const Index = mongoose.model('Index', indexSchema);
module.exports = Index;
