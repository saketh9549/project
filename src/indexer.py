import os
import hashlib
from typing import List, Dict, Any, Tuple
from pathlib import Path
from src.config import get_temp_dir
from src.extractor import extract_audio, get_video_duration
from src.transcriber import transcribe_audio, extract_segments
import src.database as db

def generate_video_id(file_path: str) -> str:
    """Generates a fast, unique fingerprint ID for a file.
    
    Combines absolute path, file size, and modification time to create a 
    deterministic 16-character SHA-256 hash. Avoids reading the whole file.
    """
    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"File not found: {abs_path}")
        
    file_stat = os.stat(abs_path)
    fingerprint = f"{abs_path}_{file_stat.st_size}_{file_stat.st_mtime}"
    return hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:16]

def chunk_segments(segments: List[Dict[str, Any]], target_duration: float = 60.0) -> List[Dict[str, Any]]:
    """Groups transcription segments into semantic blocks of ~60 seconds.
    
    Rather than cutting strictly on time boundaries (which breaks words/sentences),
    this groups continuous segments until adding the next segment would cross
    the target duration limit, preserving conversational boundaries.
    """
    if not segments:
        return []
        
    blocks = []
    current_block_segments = []
    block_start_time = segments[0]['start']
    
    for seg in segments:
        current_duration = seg['end'] - block_start_time
        
        # If we have segments in the buffer and adding this segment pushes us over 60s
        # we flush the current block first.
        if current_block_segments and current_duration > target_duration:
            text = " ".join([s['text'] for s in current_block_segments])
            blocks.append({
                'start_time': block_start_time,
                'end_time': current_block_segments[-1]['end'],
                'text': text
            })
            current_block_segments = [seg]
            block_start_time = seg['start']
        else:
            current_block_segments.append(seg)
            
    # Add final block
    if current_block_segments:
        text = " ".join([s['text'] for s in current_block_segments])
        blocks.append({
            'start_time': block_start_time,
            'end_time': current_block_segments[-1]['end'],
            'text': text
        })
        
    return blocks

def index_video(video_path: str, language: str = None) -> Tuple[str, List[Dict[str, Any]]]:
    """Runs the full pipeline to extract, transcribe, chunk, and index a video file.
    
    Args:
        video_path: Path to the video file to index.
        language: Optional language override for Whisper.
        
    Returns:
        A tuple of (video_id, semantic_blocks).
    """
    abs_path = os.path.abspath(video_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Video file not found: {abs_path}")
        
    file_name = os.path.basename(abs_path)
    video_id = generate_video_id(abs_path)
    
    print(f"[Indexer] Processing video: {file_name} (ID: {video_id})")
    
    # 1. Initialize database (creates tables if missing)
    db.init_db()
    
    # 2. Try to get video duration using ffprobe
    duration = get_video_duration(abs_path)
    
    # 3. Extract audio
    audio_path = extract_audio(abs_path)
    
    try:
        # 4. Transcribe audio
        transcription_result = transcribe_audio(audio_path, language=language)
        
        # 5. Extract timed segments
        segments = extract_segments(transcription_result)
        
        # Fallback for duration if ffprobe failed
        if duration is None:
            if segments:
                duration = segments[-1]['end']
            else:
                duration = 0.0
                
        # 6. Group segments into 60-second semantic blocks
        blocks = chunk_segments(segments, target_duration=60.0)
        
        # 7. Write to database
        db.insert_video(video_id, abs_path, file_name, duration)
        db.insert_semantic_blocks(video_id, blocks)
        
        print(f"[Indexer] Successfully indexed {len(blocks)} semantic blocks for video {file_name}!")
        return video_id, blocks
        
    finally:
        # Clean up temporary audio file to preserve disk space
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"[Indexer] Cleaned up temporary audio file: {os.path.basename(audio_path)}")
            except Exception as e:
                print(f"[Indexer Warning] Failed to delete temporary audio file: {e}")
