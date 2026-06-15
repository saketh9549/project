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

def generate_video_id(file_path: str, owner_email: str = "") -> str:
    """Generates a fast, unique fingerprint ID for a file.
    
    Combines absolute path, file size, and modification time to create a 
    deterministic 24-character SHA-256 hash (valid MongoDB ObjectId format).
    Avoids reading the whole file.
    """
    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"File not found: {abs_path}")
        
    file_stat = os.stat(abs_path)
    fingerprint = f"{owner_email.strip().lower()}_{abs_path}_{file_stat.st_size}_{file_stat.st_mtime}"
    return hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]

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
        
    valid_topics = []
    for topic in topics:
        try:
            start_time = float(topic.get('start_time', 0.0))
        except (ValueError, TypeError):
            continue
            
        if start_time < 0.0:
            start_time = 0.0
        if start_time >= video_duration:
            continue
            
        valid_topics.append({
            'start_time': start_time,
            'topic': topic.get('topic', 'Untitled Topic')
        })
        
    if not valid_topics:
        return []
        
    valid_topics = sorted(valid_topics, key=lambda x: x['start_time'])
    
    unique_topics = []
    seen_starts = set()
    for topic in valid_topics:
        start_val = round(topic['start_time'], 2)
        if start_val not in seen_starts:
            seen_starts.add(start_val)
            unique_topics.append(topic)
            
    if not unique_topics:
        return []
        
    blocks = []
    for i, topic in enumerate(unique_topics):
        start_time = topic['start_time']
        topic_title = topic['topic']
        
        if i < len(unique_topics) - 1:
            end_time = unique_topics[i+1]['start_time']
        else:
            end_time = video_duration
            
        if start_time >= end_time:
            end_time = start_time + 0.1
            
        seg_texts = []
        for seg in segments:
            seg_start = seg['start']
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
    timeline_str: str,
    segments: List[Dict[str, Any]], 
    video_duration: float
) -> List[Dict[str, Any]]:
    """Queries Gemini 1.5 Flash using the Google GenAI SDK to map segments into semantic topics."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not GEMINI_AVAILABLE:
        print("[Indexer Warning] google-genai SDK is not installed. Falling back to local chunker.")
        return chunk_segments(segments)
        
    if not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
        print("[Indexer Warning] GEMINI_API_KEY is missing or configured as placeholder. Falling back to local chunker.")
        return chunk_segments(segments)
        
    try:
        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "You are a Video Metadata Engineer. Your task is to analyze a timestamped video transcript "
            "and segment it into natural semantic topics. "
            "You must return ONLY a raw JSON array of objects matching this exact schema:\n"
            '[{"start_time": float, "topic": "YouTube Style Title"}]\n'
            "Guidelines:\n"
            "1. The start_time values in your output must represent the start time of the segment in float seconds.\n"
            "   The input transcript is formatted as lines like: [START_TIMESTAMP -> END_TIMESTAMP] Text.\n"
            "   Convert the starting timestamp (e.g., MM:SS or HH:MM:SS) into float seconds.\n"
            "   Examples:\n"
            "   - [00:00 -> 00:05] becomes 0.0\n"
            "   - [01:05 -> 01:12] becomes 65.0\n"
            "   - [01:02:15 -> 01:03:00] becomes 3735.0\n"
            "2. The start_time you choose must match one of the start timestamps present in the brackets exactly.\n"
            "3. The first topic must start at the very first segment's timestamp (usually 0.00).\n"
            "4. Topic titles must be concise, professional, and descriptive (YouTube moments style)."
        )
        
        prompt = (
            f"Here is the timestamped video transcript. "
            f"Analyze it and identify the natural concept boundaries where topics shift:\n\n"
            f"{timeline_str}"
        )
        
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
        print(f"[Indexer] Querying {model_name} for topic boundaries...")
        
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    system_instruction=system_instruction,
                    temperature=0.1
                ),
            )
        except Exception as api_err:
            if model_name != "gemini-3.1-flash-lite":
                print(f"[Indexer Warning] Model {model_name} failed: {api_err}. Retrying with fallback model gemini-3.1-flash-lite...")
                model_name = "gemini-3.1-flash-lite"
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        system_instruction=system_instruction,
                        temperature=0.1
                    ),
                )
            else:
                raise api_err
        
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

def build_transcript_string(segments: List[Dict[str, Any]]) -> str:
    """Generates dialogue transcript string with start and end times in-memory."""
    lines = []
    for seg in segments:
        start_str = format_timestamp(seg['start'])
        end_str = format_timestamp(seg['end'])
        text = seg['text'].strip()
        lines.append(f"[{start_str} -> {end_str}] {text}")
    return "\n".join(lines)

def index_video(video_path: str, language: str = None, owner_email: str = "", grid_fs_id: str = None, original_filename: str = None, s3_key: str = None, s3_bucket: str = None) -> Tuple[str, List[Dict[str, Any]]]:
    """Runs the full pipeline to extract, transcribe, chunk semantically, and index a video file."""
    abs_path = os.path.abspath(video_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Video file not found: {abs_path}")
        
    if original_filename:
        file_name = original_filename
    else:
        file_name = os.path.basename(abs_path)
        
    if grid_fs_id:
        lookup_path = file_name
    elif s3_key:
        lookup_path = s3_key
    else:
        lookup_path = abs_path
    
    # Check if a video with the same filePath already exists to prevent duplicate key violations
    existing_video = db.get_video_by_path(lookup_path, owner_email)
    if existing_video:
        video_id = existing_video["id"]
        print(f"[Indexer] Reusing existing video ID for duplicate path: {video_id}")
    else:
        if grid_fs_id:
            fingerprint = f"{owner_email.strip().lower()}_gridfs_{grid_fs_id}"
            video_id = hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]
        elif s3_key:
            fingerprint = f"{owner_email.strip().lower()}_s3_{s3_key}"
            video_id = hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]
        else:
            video_id = generate_video_id(abs_path, owner_email=owner_email)
    
    print(f"[Indexer] Processing video: {file_name} (ID: {video_id})")
    
    # 1. Initialize database collections
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
        
        # Build detailed dialogue transcript in-memory
        raw_transcript = build_transcript_string(segments)
        
        # Fallback for duration if ffprobe failed
        if duration is None:
            if segments:
                duration = segments[-1]['end']
            else:
                duration = 0.0
                
        # 6. Group segments into local sentence-aligned semantic blocks (offline indexing default)
        blocks = chunk_segments(segments)
        
        # 7. Write to database
        db.insert_video(
            video_id=video_id,
            file_path=abs_path if (not grid_fs_id and not s3_key) else (s3_key if s3_key else file_name),
            file_name=file_name,
            duration=duration,
            owner_email=owner_email,
            upload_status="indexed",
            raw_transcript=raw_transcript,
            absolute_local_path="" if (grid_fs_id or s3_key) else abs_path,
            grid_fs_id=grid_fs_id,
            s3_key=s3_key,
            s3_bucket=s3_bucket
        )
        db.insert_semantic_blocks(video_id, blocks)
        
        print(f"[Indexer] Successfully indexed {len(blocks)} blocks for video {file_name} in MongoDB!")
        return video_id, blocks
        
    finally:
        # Clean up temporary audio file to preserve disk space
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"[Indexer] Cleaned up temporary audio file: {os.path.basename(audio_path)}")
            except Exception as e:
                print(f"[Indexer Warning] Failed to delete temporary audio file: {e}")

def parse_transcript_str(raw_transcript: str) -> List[Dict[str, Any]]:
    """Parses dialogue transcript string back to segments structure to reconstruct blocks."""
    segments = []
    for line in raw_transcript.splitlines():
        line = line.strip()
        if not line.startswith("[") or " -> " not in line:
            continue
        try:
            bracket_end = line.find("]")
            if bracket_end == -1:
                continue
            time_part = line[1:bracket_end]
            text_part = line[bracket_end+1:].strip()
            
            start_str, end_str = time_part.split(" -> ")
            
            def parse_time_str(t_str: str) -> float:
                parts = list(map(int, t_str.split(":")))
                if len(parts) == 3: # HH:MM:SS
                    return parts[0] * 3600 + parts[1] * 60 + parts[2]
                elif len(parts) == 2: # MM:SS
                    return parts[0] * 60 + parts[1]
                return 0.0
                
            segments.append({
                "start": parse_time_str(start_str),
                "end": parse_time_str(end_str),
                "text": text_part
            })
        except Exception:
            continue
    return segments

def analyse_video(video_id_or_path: str, owner_email: str = "") -> str:
    """Command 2: Queries Gemini on the saved transcript and updates DB blocks."""
    # 1. Fetch video details from DB
    video = db.get_video(video_id_or_path, owner_email)
    if not video:
        video = db.get_video_by_path(video_id_or_path, owner_email)
        
    if not video:
        raise ValueError(f"Video ID or path '{video_id_or_path}' not found. Please index it first.")
        
    video_id = video['id']
    duration = video['duration']
    raw_transcript = video.get('raw_transcript', "")
    
    if not raw_transcript:
        # Fallback: Rebuild raw transcript string from existing blocks if rawTranscript field is empty
        blocks = db.get_video_blocks(video_id)
        if blocks:
            segments = []
            for b in blocks:
                segments.append({
                    "start": b["start_time"],
                    "end": b["end_time"],
                    "text": b["text"]
                })
            raw_transcript = build_transcript_string(segments)
        else:
            raise ValueError(f"No raw transcript or blocks found in database for video ID: {video_id}")
            
    print(f"[Analyse] Loaded raw transcript from database for video ID: {video_id}")
    
    # 3. Parse segments back
    segments = parse_transcript_str(raw_transcript)
    if not segments:
        raise ValueError("No valid dialogue segments could be parsed from transcript")
        
    # 4. Call Gemini on transcript contents
    blocks = chunk_semantically_with_gemini(raw_transcript, segments, duration)
    
    # Check if Gemini actually succeeded
    is_fallback = all(b.get('topic_title', '').startswith('Section ') for b in blocks)
    if is_fallback and os.getenv("GEMINI_API_KEY", "").strip() in ("", '""', "your_gemini_api_key_here"):
         print("[Analyse Warning] Gemini analysis ran in fallback mode because API key is not set.")
    
    # 5. Write semantic blocks to MongoDB
    db.insert_semantic_blocks(video_id, blocks)
    
    print(f"[Analyse] Successfully updated analysed transcript index in MongoDB for video ID: {video_id}")
    return "MongoDB Database"

def write_transcript_txt(segments: List[Dict[str, Any]], output_path: str):
    """Writes transcription segments to a text file with start and end times."""
    with open(output_path, 'w', encoding='utf-8') as f:
        for seg in segments:
            start_str = format_timestamp(seg['start'])
            end_str = format_timestamp(seg['end'])
            text = seg['text'].strip()
            f.write(f"[{start_str} -> {end_str}] {text}\n")

def parse_transcript_txt(transcript_path: str) -> List[Dict[str, Any]]:
    """Parses dialogue transcript file back to segments structure to reconstruct blocks."""
    with open(transcript_path, 'r', encoding='utf-8') as f:
        return parse_transcript_str(f.read())

