import os
import hashlib
import json
from typing import List, Dict, Any, Tuple
from pathlib import Path
from src.config import get_temp_dir, get_transcripts_dir, get_analysed_dir
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
        
    # 1. Parse and validate start times
    valid_topics = []
    for topic in topics:
        try:
            start_time = float(topic.get('start_time', 0.0))
        except (ValueError, TypeError):
            continue
            
        # Ensure start_time is non-negative and strictly less than the video duration
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
        
    # 2. Sort by start_time
    valid_topics = sorted(valid_topics, key=lambda x: x['start_time'])
    
    # 3. Deduplicate start times (if two topics have the same start time, keep the first one)
    unique_topics = []
    seen_starts = set()
    for topic in valid_topics:
        start_val = round(topic['start_time'], 2)
        if start_val not in seen_starts:
            seen_starts.add(start_val)
            unique_topics.append(topic)
            
    if not unique_topics:
        return []
        
    # 4. Construct blocks with strict end_time constraints
    blocks = []
    for i, topic in enumerate(unique_topics):
        start_time = topic['start_time']
        topic_title = topic['topic']
        
        # end_time is next topic's start_time or total video duration
        if i < len(unique_topics) - 1:
            end_time = unique_topics[i+1]['start_time']
        else:
            end_time = video_duration
            
        # Ensure start_time < end_time (safeguard)
        if start_time >= end_time:
            end_time = start_time + 0.1
            
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
    transcript_path: str,
    segments: List[Dict[str, Any]], 
    video_duration: float
) -> List[Dict[str, Any]]:
    """Reads the saved transcript file, queries Gemini 1.5 Flash using the Google GenAI SDK to map segments into semantic topics."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    # Check if SDK is available and API key is present/valid
    if not GEMINI_AVAILABLE:
        print("[Indexer Warning] google-genai SDK is not installed. Falling back to local chunker.")
        return chunk_segments(segments)
        
    if not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
        print("[Indexer Warning] GEMINI_API_KEY is missing or configured as placeholder. Falling back to local chunker.")
        return chunk_segments(segments)
        
    try:
        # Read the saved transcript file contents
        with open(transcript_path, 'r', encoding='utf-8') as f:
            timeline_str = f.read()
    except Exception as e:
        print(f"[Indexer Warning] Could not read transcript file at {transcript_path}: {e}. Falling back to local chunker.")
        return chunk_segments(segments)
        
    try:
        # Initialize Google GenAI client
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
            f"Here is the timestamped video transcript file contents. "
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
        
        # Save detailed dialogue transcript to a .txt file in the transcripts folder in the project workspace
        transcript_filename = f"{video_id}_{os.path.splitext(file_name)[0]}_transcript.txt"
        transcript_path = os.path.join(get_transcripts_dir(), transcript_filename)
        print(f"[Indexer] Saving dialogue transcript to: {transcript_path}")
        write_transcript_txt(segments, transcript_path)
        
        # Fallback for duration if ffprobe failed
        if duration is None:
            if segments:
                duration = segments[-1]['end']
            else:
                duration = 0.0
                
        # 6. Group segments into local sentence-aligned semantic blocks (offline indexing default)
        blocks = chunk_segments(segments)
        
        # 7. Write to database
        db.insert_video(video_id, abs_path, file_name, duration)
        db.insert_semantic_blocks(video_id, blocks)
        
        print(f"[Indexer] Successfully indexed {len(blocks)} blocks for video {file_name}!")
        return video_id, blocks
        
    finally:
        # Clean up temporary audio file to preserve disk space
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"[Indexer] Cleaned up temporary audio file: {os.path.basename(audio_path)}")
            except Exception as e:
                print(f"[Indexer Warning] Failed to delete temporary audio file: {e}")

def parse_transcript_txt(transcript_path: str) -> List[Dict[str, Any]]:
    """Step 1: Parses dialogue transcript back to segments structure to reconstruct blocks."""
    segments = []
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
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

def analyse_video(video_id_or_path: str) -> str:
    """Command 2: Queries Gemini on the saved transcript, updates DB blocks, and writes analysed timeline file."""
    # 1. Fetch video details from DB
    video = db.get_video(video_id_or_path)
    if not video:
        video = db.get_video_by_path(video_id_or_path)
        
    if not video:
        raise ValueError(f"Video ID or path '{video_id_or_path}' not found. Please index it first.")
        
    video_id = video['id']
    file_name = video['file_name']
    duration = video['duration']
    
    # 2. Locate transcript file
    transcript_filename = f"{video_id}_{os.path.splitext(file_name)[0]}_transcript.txt"
    transcript_path = os.path.join(get_transcripts_dir(), transcript_filename)
    if not os.path.exists(transcript_path):
        # Fallback to scanning folder for any match starting with ID
        found = False
        for f_name in os.listdir(get_transcripts_dir()):
            if f_name.startswith(video_id):
                transcript_path = os.path.join(get_transcripts_dir(), f_name)
                found = True
                break
        if not found:
            raise FileNotFoundError(f"Saved transcript file not found for video ID: {video_id}")
            
    print(f"[Analyse] Found saved transcript: {os.path.basename(transcript_path)}")
    
    # 3. Parse segments back
    segments = parse_transcript_txt(transcript_path)
    if not segments:
        raise ValueError(f"No valid dialogue segments could be parsed from transcript at {transcript_path}")
        
    # 4. Call Gemini on transcript file contents
    blocks = chunk_semantically_with_gemini(transcript_path, segments, duration)
    
    # Check if Gemini actually succeeded (Gemini chunking has topic titles, fallback has generic 'Section X')
    is_fallback = all(b.get('topic_title', '').startswith('Section ') for b in blocks)
    if is_fallback and os.getenv("GEMINI_API_KEY", "").strip() in ("", '""', "your_gemini_api_key_here"):
         print("[Analyse Warning] Gemini analysis ran in fallback mode because API key is not set.")
    
    # 5. Write semantic blocks to SQLite (updating database blocks)
    db.insert_semantic_blocks(video_id, blocks)
    
    # 6. Save newly analysed chapters transcript file
    analysed_filename = f"{video_id}_{os.path.splitext(file_name)[0]}_analysed.txt"
    analysed_path = os.path.join(get_analysed_dir(), analysed_filename)
    
    with open(analysed_path, 'w', encoding='utf-8') as f:
        f.write(f"VIDEO: {file_name}\n")
        f.write(f"VIDEO ID: {video_id}\n")
        f.write(f"DURATION: {format_timestamp(duration)}\n")
        f.write("=" * 65 + "\n")
        f.write("KEY MOMENTS TIMELINE:\n")
        f.write("-" * 65 + "\n")
        for idx, block in enumerate(blocks, start=1):
            start_str = format_timestamp(block['start_time'])
            chapter_id = f"{video_id}-{idx}"
            f.write(f" {f'[{start_str}]':<9} | {chapter_id:<20} | {block['topic_title']}\n")
        f.write("=" * 65 + "\n\n")
        
        f.write("DETAILED TOPIC-WISE TRANSCRIPT:\n")
        f.write("=" * 65 + "\n\n")
        for idx, block in enumerate(blocks, start=1):
            start_str = format_timestamp(block['start_time'])
            end_str = format_timestamp(block['end_time'])
            chapter_id = f"{video_id}-{idx}"
            f.write(f"=== {f'[{start_str} -> {end_str}]':<17} [ID: {chapter_id}] {block['topic_title']} ===\n")
            f.write(f"{block['text']}\n\n")
            
    print(f"[Analyse] Successfully saved analysed transcript index to: {analysed_path}")
    return analysed_path
