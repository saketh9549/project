import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent

# Configuration values
WHISPER_URL = os.getenv("WHISPER_URL", "http://localhost:9000/v1/audio/transcriptions")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/summarix")

# Temporary directory for extracted audio
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Path to ffmpeg executable
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")

def get_mongodb_uri() -> str:
    """Returns the MongoDB connection URI."""
    return MONGODB_URI

def get_temp_dir() -> Path:
    """Returns the temporary directory path."""
    return TEMP_DIR

