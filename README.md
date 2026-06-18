# 🎥 Summarix - Video Chapter Indexer & Summary Console

Summarix is a high-performance, developer-centric video indexing and chapter summarization platform. It features an offline-first transcription pipeline utilizing local `faster-whisper` on CPU, semantic chapter boundary analysis using the Google GenAI Gemini API, cloud-backed AWS S3 video streaming storage, and an interactive React + Tailwind CSS dashboard with a drag-and-drop workflow.

---

## 🛠️ System Architecture

The pipeline processes files in-memory through the following flow:

```
[Upload / Local Path] ──► [S3 Storage / Proxy] ──► [FFmpeg Audio Extract]
                                                         │
[MongoDB Database] ◄── [Segment Mapper] ◄── [Gemini] ◄── [Whisper CPU Transcribe]
```

1. **Fingerprinting & De-duplication:** Deterministic 24-character IDs based on file parameters are generated to avoid redundant transcription.
2. **Direct S3 Streaming Upload:** Video uploads are streamed directly to AWS S3 via multipart uploads, bypassing local disk storage.
3. **In-Memory Audio Extraction:** FFmpeg extracts mono, 16kHz audio tracks on-the-fly.
4. **Whisper Transcription:** Transcribes audio locally using a native `faster-whisper` `"base"` model with `int8` quantization on CPU.
5. **Gemini Semantic Topic Segmentation:** Feeds the transcript to Gemini (defaulting to `gemini-3.1-flash-lite`) to map dialogues into structured JSON chapter moments.
6. **MongoDB Storage:** Data collections for `catalogs`, `indices`, and `summaries` are written directly to MongoDB Atlas.
7. **S3 Range Streaming Proxy:** A multi-threaded FastAPI range-request proxy streams video bytes directly from S3 to support seek operations in HTML5 players.

---

## 📁 Project Directory Structure

```
echochunk-workspace/
├── backend/              # FastAPI Python Backend
│   ├── src/              # Python source modules (config, database, indexer, etc.)
│   ├── requirements.txt  # Backend dependencies
│   ├── .env              # Live configurations (DB connection, AWS S3, Gemini API keys)
│   ├── server.py         # Multi-threaded API Server (port 8000)
│   ├── main.py           # CLI wrapper helper
│   └── test_*.py         # Pytest automated test files
└── frontend/             # React + Vite + Tailwind CSS Frontend
    ├── src/              # React components, styles, and hooks
    ├── package.json      # Frontend dependencies
    └── vite.config.js    # Vite configuration (proxies /api to port 8000)
```

---

## 🚀 Installation & Setup

### Prerequisites
* **Python 3.10+**
* **Node.js 18+**
* **FFmpeg:** Ensure `ffmpeg` and `ffprobe` are installed and in your system PATH.

### 1. Backend Configuration
1. Navigate to the backend directory and install Python dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and fill in your credentials:
   ```env
   MONGODB_URI="mongodb+srv://..."
   GEMINI_API_KEY="AIzaSy..."
   AWS_ACCESS_KEY_ID="..."
   AWS_SECRET_ACCESS_KEY="..."
   AWS_S3_BUCKET="..."
   ```
3. Start the backend API server:
   ```bash
   python server.py
   ```
   The API server runs on `http://localhost:8000`.

### 2. Frontend Configuration
1. Navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The dashboard is available at `http://localhost:5173`.

---

## 💻 CLI Command Guide

You can also run tasks from the command-line inside the `backend/` folder:

### 1. Index Video (`index`)
Extracts audio and transcribes dialogue locally.
```bash
python main.py index C:\path\to\video.mp4
```
*Optional: Override language detection using `-l <lang_code>` (e.g. `-l en`).*

### 2. Semantic Analysis (`analyse`)
Generates chapter moments and updates the database using Gemini.
```bash
python main.py analyse <video_id>
```

### 3. List Videos (`list`)
Lists all indexed videos in the database.
```bash
python main.py list
```

---

## 🧪 Automated Testing

Backend tests are run using `pytest`:
```bash
cd backend
python -m pytest
```
All tests verify database operations, GridFS streaming, S3 integrations, and fallback transcription conditions.
