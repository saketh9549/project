import os
import hashlib
import json
from typing import List, Dict, Any, Tuple
from pathlib import Path
from src.config import get_temp_dir
from src.extractor import extract_audio, get_video_duration
from src.transcriber import transcribe_audio, extract_segments
import src.database as db

# Import Google GenAI SDK
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

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
    """Legacy/Fallback Chunker: Groups transcription segments into blocks of ~60 seconds.
    
    Appends a default 'topic_title' to comply with the database schema.
    """
    if not segments:
        return []
        
    blocks = []
    current_block_segments = []
    block_start_time = segments[0]['start']
    
    for seg in segments:
        current_duration = seg['end'] - block_start_time
        
        if current_block_segments and current_duration > target_duration:
            text = " ".join([s['text'] for s in current_block_segments])
            block_idx = len(blocks) + 1
            blocks.append({
                'start_time': block_start_time,
                'end_time': current_block_segments[-1]['end'],
                'topic_title': f"Section {block_idx}",
                'text': text
            })
            current_block_segments = [seg]
            block_start_time = seg['start']
        else:
            current_block_segments.append(seg)
            
    # Add final block
    if current_block_segments:
        block_idx = len(blocks) + 1
        text = " ".join([s['text'] for s in current_block_segments])
        blocks.append({
            'start_time': block_start_time,
            'end_time': current_block_segments[-1]['end'],
            'topic_title': f"Section {block_idx}",
            'text': text
        })
        
    return blocks

def build_timeline_string(segments: List[Dict[str, Any]]) -> str:
    """Step A: Maps Whisper segments into a timeline string formatted for LLM ingestion."""
    lines = []
    for seg in segments:
        lines.append(f"[{seg['start']:.2f}] {seg['text']}")
    return "\n".join(lines)

def reconstruct_blocks_from_topics(
    segments: List[Dict[str, Any]], 
    topics: List[Dict[str, Any]], 
    video_duration: float
) -> List[Dict[str, Any]]:
    """Step C: Reconstructs semantic blocks by matching segments into Gemini topic boundaries."""
    if not topics:
        return []
        
    # Sort topics by start_time
    topics = sorted(topics, key=lambda x: x.get('start_time', 0.0))
    
    blocks = []
    for i, topic in enumerate(topics):
        start_time = float(topic.get('start_time', 0.0))
        topic_title = topic.get('topic', 'Untitled Topic')
        
        # Calculate end_time: next topic's start_time or total video duration
        if i < len(topics) - 1:
            end_time = float(topics[i+1].get('start_time', 0.0))
        else:
            end_time = video_duration
            
        # Filter and merge text segments in this range
        seg_texts = []
        for seg in segments:
            seg_start = seg['start']
            # Match if segment start is within topic boundary (with small float epsilon)
            if start_time - 0.05 <= seg_start < end_time - 0.05:
                seg_texts.append(seg['text'])
                
        text = " ".join(seg_texts).strip()
        
        blocks.append({
            'start_time': start_time,
            'end_time': end_time,
            'topic_title': topic_title,
            'text': text
        })
        
    return blocks

def chunk_semantically_with_gemini(
    segments: List[Dict[str, Any]], 
    video_duration: float
) -> List[Dict[str, Any]]:
    """Query Gemini 1.5 Flash using the Google GenAI SDK to map segments into semantic topics."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    # Check if SDK is available and API key is present/valid
    if not GEMINI_AVAILABLE:
        print("[Indexer Warning] google-genai SDK is not installed. Falling back to local chunker.")
        return chunk_segments(segments)
        
    if not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
        print("[Indexer Warning] GEMINI_API_KEY is missing or configured as placeholder. Falling back to local chunker.")
        return chunk_segments(segments)
        
    timeline_str = build_timeline_string(segments)
    
    try:
        # Initialize Google GenAI client
        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "You are a Video Metadata Engineer. Your task is to analyze a timestamped video transcript "
            "and segment it into natural semantic topics. "
            "You must return ONLY a raw JSON array of objects matching this exact schema:\n"
            '[{"start_time": float, "topic": "YouTube Style Title"}]\n'
            "Guidelines:\n"
            "1. The start_time values MUST exactly match one of the start timestamps provided in brackets [START_TIME] in the input.\n"
            "2. The first topic must start at the very first segment's timestamp (usually 0.00).\n"
            "3. Topic titles must be concise, professional, and descriptive (YouTube moments style)."
        )
        
        prompt = (
            f"Here is the timestamped video transcript timeline. "
            f"Analyze it and identify the natural concept boundaries where topics shift:\n\n"
            f"{timeline_str}"
        )
        
        print("[Indexer] Querying gemini-1.5-flash for topic boundaries...")
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                system_instruction=system_instruction,
                temperature=0.1
            ),
        )
        
        # Clean response string if needed
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
        
        topics = json.loads(raw_text)
        if not isinstance(topics, list):
            raise ValueError("Response is not a JSON list.")
            
        blocks = reconstruct_blocks_from_topics(segments, topics, video_duration)
        if not blocks:
            raise ValueError("Reconstructed blocks came back empty.")
            
        return blocks
        
    except Exception as e:
        print(f"[Indexer Warning] Gemini semantic chunking failed: {e}. Falling back to local chunker.")
        return chunk_segments(segments)

def format_timestamp(seconds: float) -> str:
    """Formats float seconds into a readable HH:MM:SS or MM:SS timestamp string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def write_transcript_txt(segments: List[Dict[str, Any]], output_path: str):
    """Writes transcription segments to a text file with start and end times."""
    with open(output_path, 'w', encoding='utf-8') as f:
        for seg in segments:
            start_str = format_timestamp(seg['start'])
            end_str = format_timestamp(seg['end'])
            text = seg['text'].strip()
            f.write(f"[{start_str} -> {end_str}] {text}\n")

def index_video(video_path: str, language: str = None) -> Tuple[str, List[Dict[str, Any]]]:
    """Runs the full pipeline to extract, transcribe, chunk semantically, and index a video file."""
    abs_path = os.path.abspath(video_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Video file not found: {abs_path}")
        
    file_name = os.path.basename(abs_path)
    video_id = generate_video_id(abs_path)
    
    print(f"[Indexer] Processing video: {file_name} (ID: {video_id})")
    
    # 1. Initialize database (creates tables or runs alterations if missing)
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
        
        # Save detailed dialogue transcript to a .txt file next to the video
        transcript_path = os.path.splitext(abs_path)[0] + "_transcript.txt"
        print(f"[Indexer] Saving dialogue transcript to: {os.path.basename(transcript_path)}")
        write_transcript_txt(segments, transcript_path)
        
        # Fallback for duration if ffprobe failed
        if duration is None:
            if segments:
                duration = segments[-1]['end']
            else:
                duration = 0.0
                
        # 6. Group segments into semantic topic blocks (Gemini with local fallback)
        blocks = chunk_semantically_with_gemini(segments, duration)
        
        # 7. Write to database
        db.insert_video(video_id, abs_path, file_name, duration)
        db.insert_semantic_blocks(video_id, blocks)
        
        print(f"[Indexer] Successfully indexed {len(blocks)} topic blocks for video {file_name}!")
        return video_id, blocks
        
    finally:
        # Clean up temporary audio file to preserve disk space
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"[Indexer] Cleaned up temporary audio file: {os.path.basename(audio_path)}")
            except Exception as e:
                print(f"[Indexer Warning] Failed to delete temporary audio file: {e}")
