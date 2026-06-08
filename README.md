# 🎥 Offline-First Video Chapter Indexer

[![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Local Speech-to-Text](https://img.shields.io/badge/Whisper-faster--whisper-orange.svg)](https://github.com/SYSTRAN/faster-whisper)
[![Gemini Engine](https://img.shields.io/badge/LLM-Gemini--3.1--Flash--Lite-blueviolet.svg)](https://deepmind.google/technologies/gemini/)

An offline-first, high-performance command-line utility to index local video files. It transcribes audio locally using `faster-whisper` on CPU, identifies natural semantic boundaries using the Google GenAI Gemini API, generates YouTube-style moment timelines with custom chapter IDs, and allows on-demand block summarizing.

---

## 🛠️ System Architecture

The pipeline processes files locally through the following flow:

```
[Local Video] ──► [FFmpeg Extraction] ──► [Local Whisper Transcription]
                                                      │
[SQLite Database] ◄── [Segment Mapper] ◄── [Gemini API] ◄── [Saved Transcript Text File]
       │
       └──► [On-Demand Summaries]
```

1. **Fingerprinting & De-duplication (`src/indexer.py`):** Generates a SHA-256 fingerprint based on file paths, sizes, and modification dates to avoid redundant transcribing.
2. **Audio Extraction (`src/extractor.py`):** Extracts audio as a Whisper-friendly 16kHz mono MP3.
3. **Local Transcription (`src/transcriber.py`):** Runs a native `faster-whisper` model (`base` model, `int8` quantization) completely locally on CPU.
4. **Transcript Archival (`src/indexer.py`):** Saves granular transcripts to the `transcripts/` directory.
5. **Gemini Topic Segmentation (`src/indexer.py`):** Feeds the archived transcript to the Gemini API (defaulting to `gemini-3.1-flash-lite`) to map dialogues into structured JSON topic moments.
   - **Model Fallback:** If the primary model fails (e.g. `404 NOT_FOUND`), it automatically retries using `gemini-3.1-flash-lite`.
   - **Bounds Check:** Discards out-of-bound timestamps and corrects inverted ranges.
   - **Local Fallback:** Drops back to a local ~60s sentence-aligned chunker if the API key is missing.
6. **SQLite Storage & Mapping (`src/database.py`):** Merges transcribed dialogue blocks matching Gemini topic boundaries and saves them with cascading deletions.
7. **Chapter summaries (`main.py`):** Generates and caches bulleted summaries of specific moment transcripts on-demand.

---

## 📁 Project Directory Structure

```
echochunk-workspace/
├── main.py               # CLI entry point
├── requirements.txt      # Python dependencies
├── .env                  # Live environment configurations
├── .env.example          # Environment template
├── test_indexer.py       # Automated unit test suite
├── src/
│   ├── config.py         # Workspace directory and path loaders
│   ├── database.py       # SQLite schema and query methods
│   ├── extractor.py      # FFmpeg audio and metadata extractors
│   ├── transcriber.py    # Native CPU faster-whisper runner
│   └── indexer.py        # Pipeline orchestrator & chunking logic
├── transcripts/          # Archived raw transcripts (untracked)
├── analysed/             # Generated moment timelines (untracked)
└── summaries/            # Cached chapter summaries (untracked)
```

---

## 🚀 Installation & Setup

### Prerequisites
1. **Python 3.8+**
2. **FFmpeg:** Ensure FFmpeg is installed and added to your system `PATH`.
   - **Windows:** Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) and add its `bin` directory to your System Environment variables (or define `FFMPEG_PATH` in `.env`).

### Quick Start
1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in your Gemini API key:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   DB_PATH="data/indexer.db"
   GEMINI_MODEL="gemini-3.1-flash-lite"
   ```

---

## 💻 CLI Command Guide

### 1. Index Video (`index`)
Extracts audio and transcribes dialogue locally.
```bash
python main.py index C:\path\to\your\video.mp4
```
*Optional: Override language detection using `-l <code_code>` (e.g. `-l en`).*

### 2. Semantic Analysis (`analyse`)
Generates chapter moments and updates the database using Gemini.
```bash
python main.py analyse ca84fc53ba36f8eb
```
Saves output transcripts inside `analysed/<video_id>_<video_basename>_analysed.txt`.

### 3. List Videos (`list`)
Lists all indexed videos in the database.
```bash
python main.py list
```

### 4. Show Chapters (`show`)
Displays a YouTube-style moment timeline with formatted chapter IDs.
```bash
python main.py show ca84fc53ba36f8eb
```
**Example output:**
```
Video: 3333.mp3
ID: ca84fc53ba36f8eb
Duration: 05:14
Total Topics: 5

CHAPTER ID           | TIMESTAMP  | KEY MOMENT TOPIC
---------------------------------------------------------------------------
 ca84fc53ba36f8eb-1   |  [00:00]  | The Power of Making Your Bed
 ca84fc53ba36f8eb-2   |  [00:50]  | Lessons from Navy SEAL Training
 ca84fc53ba36f8eb-3   |  [02:15]  | Universal Principles for Changing the World
 ca84fc53ba36f8eb-4   |  [03:39]  | Finding Strength in Darkest Moments
 ca84fc53ba36f8eb-5   |  [04:56]  | The Power of Hope and Perseverance
```

### 5. Summarize Chapter (`summarize`)
Generates and saves a structured, bulleted summary of a specific chapter transcript.
```bash
python main.py summarize ca84fc53ba36f8eb-2
```
Saves output inside `summaries/<video_id>_<chapter_id>_summary.txt`.
**Example Output:**
```text
Summarizing Chapter for: 3333.mp3
Topic: Lessons from Navy SEAL Training
Time Range: [00:50 -> 02:15]
-----------------------------------------------------------------
[Summarizer] Querying gemini-3.1-flash-lite for summary...

SUMMARY:
### Summary: The Power of Small Disciplines
This segment focuses on the lessons learned during Navy SEAL training.
- Making a bed to perfection instills discipline, attention to detail, and order.
- Simple, mundane tasks build the mental fortitude required for larger challenges.

[Summarizer] Summary successfully saved to: C:\Users\Lenovo\Documents\echochunk-workspace\summaries\ca84fc53ba36f8eb_ca84fc53ba36f8eb-2_summary.txt
```

### 6. Search Transcripts (`search`)
Searches across all transcripts for a specific keyword.
```bash
python main.py search ca84fc53ba36f8eb "Whisper"
```

### 7. Delete Index (`delete`)
Removes a video index and its blocks from the database.
```bash
python main.py delete ca84fc53ba36f8eb
```

---

---

## 🖥️ Web Dashboard GUI

For an interactive web interface, you can start the local API server and open the premium dark-mode dashboard in your browser.

### 1. Start the Local Server
Launch the built-in server from the workspace root:
```bash
python server.py
```
This runs a zero-dependency server on port `8000`.

### 2. Open the Dashboard
Navigate to `http://localhost:8000` in your web browser.

### 💡 Features in the Dashboard:
- **Interactive File Indexer:** Type the absolute path of a local video file (e.g. `C:\path\to\video.mp4`), specify a language override, and click **Index Video** to trigger CPU Whisper transcription.
- **Dynamic Catalog Browser:** Select from previously indexed video files to instantly load their moment timelines.
- **One-Click Gemini Analysis:** If a video was only indexed locally (fallback chunker), click **Analyse with Gemini** to run semantic boundaries mapping.
- **Keyword Search & Highlight:** Filter moments in real-time as you type, with matching phrases highlighted automatically.
- **On-Demand Block Summarization:** Click the **Summarize** button on any moment card. The summary, key takeaways, and action items will display in the right sidebar console and automatically save to disk.

---

## 🧪 Automated Testing

We run comprehensive testing for chunking calculations, SQLite schemas, database cascading, and Gemini model fallback scenarios:
```bash
python -m unittest test_indexer.py
```
**Output:**
```text
..............
----------------------------------------------------------------------
Ran 14 tests in 0.026s

OK
```
