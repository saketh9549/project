import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent

# Configuration values
WHISPER_URL = os.getenv("WHISPER_URL", "http://localhost:9000/v1/audio/transcriptions")
DB_PATH_RAW = os.getenv("DB_PATH", "data/indexer.db")

# Compute absolute DB Path
if os.path.isabs(DB_PATH_RAW):
    DB_PATH = Path(DB_PATH_RAW)
else:
    DB_PATH = BASE_DIR / DB_PATH_RAW

# Ensure database directory exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Temporary directory for extracted audio
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Path to ffmpeg executable
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")

# Transcripts output directory in the project
TRANSCRIPTS_DIR = BASE_DIR / "transcripts"
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

# Analysed transcripts output directory in the project
ANALYSED_DIR = BASE_DIR / "analysed"
ANALYSED_DIR.mkdir(parents=True, exist_ok=True)

def get_db_path() -> str:
    """Returns the absolute path to the database file as a string."""
    return str(DB_PATH)

def get_temp_dir() -> Path:
    """Returns the temporary directory path."""
    return TEMP_DIR

def get_transcripts_dir() -> Path:
    """Returns the transcripts directory path."""
    return TRANSCRIPTS_DIR

def get_analysed_dir() -> Path:
    """Returns the analysed transcripts directory path."""
    return ANALYSED_DIR
