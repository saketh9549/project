# EchoChunk Workspace Rules

1. **Local Footprint Constraints:** The host system only has 20 GB of storage remaining. 
2. **Audio Compression:** When utilizing `ffmpeg` to extract audio from video, always apply high compression filters (`-q:a 5` or lower bitrate) to keep temporary `.mp3` sizes microscopic.
3. **Lazy Execution:** Never generate summaries on the initial file upload. The transcription chunks must be stored raw. Summaries must only be triggered via on-demand function calls.