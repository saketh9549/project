const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Playlist name is required'],
    trim: true
  },
  ownerEmail: {
    type: String,
    required: [true, 'Owner email is required'],
    trim: true,
    lowercase: true
  }
}, {
  timestamps: true
});

playlistSchema.index({ ownerEmail: 1 });

const Playlist = mongoose.model('Playlist', playlistSchema);
module.exports = Playlist;
