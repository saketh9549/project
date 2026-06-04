import os
import subprocess
import shutil
from pathlib import Path
from typing import Optional
from src.config import FFMPEG_PATH, get_temp_dir

class FFmpegNotFoundError(Exception):
    """Exception raised when ffmpeg is not found on the system."""
    pass

def check_ffmpeg() -> str:
    """Checks if ffmpeg is available. Returns the resolved path/command to use.
    
    Raises:
        FFmpegNotFoundError: If ffmpeg is not found in PATH or configured path.
    """
    # Check if configured FFMPEG_PATH works
    try:
        subprocess.run(
            [FFMPEG_PATH, "-version"], 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL, 
            check=True
        )
        return FFMPEG_PATH
    except (subprocess.SubprocessError, FileNotFoundError):
        # Fall back to finding 'ffmpeg' in system PATH
        resolved = shutil.which("ffmpeg")
        if resolved:
            return resolved
        
        # If not in path, search common locations on Windows
        common_windows_paths = [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"
        ]
        for path in common_windows_paths:
            if os.path.exists(path):
                return path

        raise FFmpegNotFoundError(
            "ffmpeg was not found on your system. Please install ffmpeg and make sure it is in your system PATH, "
            "or configure FFMPEG_PATH in your .env file."
        )

def get_video_duration(video_path: str) -> Optional[float]:
    """Gets the duration of a video file in seconds using ffprobe.
    
    Returns None if ffprobe is not available or errors out.
    """
    # Find ffprobe. Typically it is located in the same directory as ffmpeg.
    ffmpeg_bin = check_ffmpeg()
    ffprobe_bin = "ffprobe"
    
    # If a custom path was specified for ffmpeg, try to look for ffprobe in the same directory
    if os.path.isabs(ffmpeg_bin):
        parent_dir = Path(ffmpeg_bin).parent
        candidate = parent_dir / "ffprobe.exe" if os.name == 'nt' else parent_dir / "ffprobe"
        if candidate.exists():
            ffprobe_bin = str(candidate)
    else:
        # Check standard path
        resolved_ffprobe = shutil.which("ffprobe")
        if resolved_ffprobe:
            ffprobe_bin = resolved_ffprobe
        else:
            # Check common windows paths for ffprobe as well
            common_windows_paths = [
                r"C:\ffmpeg\bin\ffprobe.exe",
                r"C:\Program Files\ffmpeg\bin\ffprobe.exe",
                r"C:\Program Files (x86)\ffmpeg\bin\ffprobe.exe"
            ]
            for path in common_windows_paths:
                if os.path.exists(path):
                    ffprobe_bin = path
                    break
    
    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"[Extractor Warning] Could not determine video duration using ffprobe: {e}")
        return None

def extract_audio(video_path: str) -> str:
    """Extracts mono, 16kHz audio from a video file and saves it in the temp directory.
    
    Args:
        video_path: Path to the source video file.
        
    Returns:
        The absolute path to the extracted audio file.
        
    Raises:
        FileNotFoundError: If the video_path does not exist.
        subprocess.CalledProcessError: If the ffmpeg command fails.
    """
    video_path_obj = Path(video_path).resolve()
    if not video_path_obj.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
        
    ffmpeg_bin = check_ffmpeg()
    
    # Generate unique output filename in temp folder based on input path hash
    import hashlib
    path_hash = hashlib.sha256(str(video_path_obj).encode('utf-8')).hexdigest()[:12]
    audio_filename = f"{path_hash}_{video_path_obj.stem}.mp3"
    output_path = get_temp_dir() / audio_filename
    
    # ffmpeg command to extract audio:
    # -y: overwrite output
    # -i: input file
    # -vn: disable video recording
    # -acodec libmp3lame: MP3 codec
    # -ar 16000: set audio sampling rate to 16kHz
    # -ac 1: set audio channels to 1 (mono)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(video_path_obj),
        "-vn",
        "-acodec", "libmp3lame",
        "-ar", "16000",
        "-ac", "1",
        str(output_path)
    ]
    
    print(f"[Extractor] Extracting audio from {video_path_obj.name}...")
    
    # Run ffmpeg command
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode, 
            cmd, 
            output=result.stdout, 
            stderr=result.stderr
        )
        
    print(f"[Extractor] Audio extracted successfully: {output_path.name}")
    return str(output_path)
