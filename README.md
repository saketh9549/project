# Offline-First Video Chapter Indexer

An offline-first Python utility to index local video files, transcribe speech natively using `faster-whisper`, detect semantic topic shifts using the Google GenAI Gemini API, and display them as a clean, chronological "Key Moments" timeline.

---

## Architecture & How It Works

The indexing pipeline processes local video files through the following stages:

```
[Local Video] ──► [FFmpeg Extraction] ──► [Local Whisper Transcription]
                                                      │
[SQLite Database] ◄── [Segment Mapper] ◄── [Gemini API] ◄── [Saved Transcript Text File]
```

1. **Fingerprinting & De-duplication (`src/indexer.py`):**
   Generates a fast, deterministic SHA-256 fingerprint based on file path, size, and modification time to index videos uniquely.

2. **Audio Extraction (`src/extractor.py`):**
   Uses `ffmpeg` via Python's `subprocess` to extract audio from video as a Whisper-optimized 16kHz mono MP3.

3. **Native Speech-to-Text (`src/transcriber.py`):**
   Runs a local `faster-whisper` (`base` model, quantized to 8-bit `int8` on CPU) to run transcribing locally without sending audio data over the network.

4. **Transcript Archival (`src/indexer.py`):**
   Saves a detailed dialogue transcript formatted as `[MM:SS -> MM:SS] dialogue line` into a centralized `transcripts/` directory inside the project root.

5. **Gemini Topic Segmentation (`src/indexer.py`):**
   Reads the saved transcript file and feeds it to `gemini-1.5-flash` using the modern `google-genai` SDK. Gemini acts as a Video Metadata Engineer, parsing the time ranges, determining topic boundaries, and returning structured JSON:
   ```json
   [
     {"start_time": 0.0, "topic": "Introduction"},
     {"start_time": 65.0, "topic": "Installation Guide"}
   ]
   ```
   *Note: If your `GEMINI_API_KEY` is missing or the request fails, the pipeline falls back gracefully to a local ~60-second sentence-aligned chunker.*

6. **SQLite Storage & Indexing (`src/database.py`):**
   Reconstructs text blocks by matching Whisper segments into Gemini's topic slots and saves them to a local SQLite database (`data/indexer.db`) with cascading deletions.

7. **Timeline Moment Display (`main.py`):**
   Renders chronological Moments timelines and lets you query snippets easily.

---

## Installation & Setup

### Prerequisites

1. **Python 3.8+**
2. **FFmpeg:** FFmpeg must be installed on your machine and available in your system `PATH`.
   - **Windows:** Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) and add its `bin` directory to your System Environment variables.
   - You can also configure a custom path using `FFMPEG_PATH` in your `.env` file.

### Installation Steps

1. **Clone/Open the workspace directory** and install the Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. **Setup your environment variables:**
   Copy `.env.example` to `.env` and fill in your Google Gemini API Key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to include:
   ```env
   GEMINI_API_KEY="AIzaSy..."
   DB_PATH="data/indexer.db"
   ```

---

## CLI Usage Guide

All interactions are executed through the `main.py` entrypoint.

### 1. Index a Local Video File (Step 1)
Extracts audio and transcribes it natively using CPU Whisper. This command runs **completely locally** and outputs a raw transcript file:
```bash
python main.py index C:\path\to\your\video.mp4
```
*Tip: You can pass an optional `-l` or `--language` code to force a specific translation language (e.g., `-l en`).*

During indexing, the dialogue transcript is saved to the project's centralized `transcripts/` directory as:
`transcripts/<video_id>_<video_basename>_transcript.txt`

### 2. Analyse the Transcript using Gemini (Step 2)
Reads the saved dialogue transcript file from step 1, passes it to the Gemini API using the `GEMINI_API_KEY` defined in your `.env` file, updates the database index with natural topic boundaries, and saves the output in the project's `analysed/` directory:
```bash
python main.py analyse ca84fc53ba36f8eb
```
The newly analysed topic-wise transcript (complete with highlights and topic-structured dialogues) is saved in the project's `analysed/` folder as:
`analysed/<video_id>_<video_basename>_analysed.txt`

### 3. List All Indexed Videos
Display all videos in the database catalog:
```bash
python main.py list
```
**Example output:**
```
VIDEO ID           | FILE NAME                      | DURATION   | INDEXED AT
--------------------------------------------------------------------------------
ca84fc53ba36f8eb   | 3333.mp3                       | 05:14      | 2026-06-04 15:45:10
```

### 4. Show Video Chapters (Key Moments Timeline)
Displays the generated semantic moments timeline in a professional YouTube-style moments layout:
```bash
python main.py show ca84fc53ba36f8eb
```
**Example output:**
```
Video: 3333.mp3
ID: ca84fc53ba36f8eb
Duration: 05:14
Total Topics: 6

TIMESTAMP  | KEY MOMENT TOPIC
-----------------------------------------------------------------
  [00:00]   | Introduction and Setup
  [00:59]   | Installing FFmpeg and Whisper Libraries
  [01:52]   | Initializing Local WhisperModel
  [02:48]   | Running Segment boundary checks
  [03:47]   | Generating JSON boundaries via Gemini
  [04:56]   | Summary of Execution Results
```

### 5. Search Transcript Snippets
Searches for keywords across all indexed text blocks for a video, displaying matched topics and highlighting keyword hits:
```bash
python main.py search ca84fc53ba36f8eb "Whisper"
```
**Example output:**
```
Searching for 'Whisper' in '3333.mp3'...
Found 1 matching block(s):

[01:52 -> 02:48] (Initializing Local WhisperModel)
  Once the audio file is ready, we initialize the **WHISPER** model locally on our CPU.
```

### 6. Delete a Video Index
Wipes a video and all of its associated semantic blocks from the SQLite database:
```bash
python main.py delete ca84fc53ba36f8eb
```

---

## Running Automated Tests

To ensure the integrity of database queries, semantic chunking boundaries, and segment mapping calculations, run the unit test suite:
```bash
python -m unittest test_indexer.py
```
Outputs:
```
..........
----------------------------------------------------------------------
Ran 10 tests in 0.017s

OK
```
