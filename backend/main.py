import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import sys
import argparse
from pathlib import Path
from src.indexer import index_video
import src.database as db

def format_timestamp(seconds: float) -> str:
    """Formats float seconds into a readable HH:MM:SS or MM:SS timestamp string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def cmd_index(args):
    """Handler for the 'index' command."""
    video_path = args.video_path
    if not Path(video_path).exists():
        print(f"Error: Video file does not exist: {video_path}", file=sys.stderr)
        sys.exit(1)
        
    try:
        video_id, blocks = index_video(video_path, language=args.language)
        print(f"\nSuccess! Video indexed with ID: {video_id}")
        print(f"Total semantic blocks: {len(blocks)}")
        
        # Show first couple of blocks as preview
        if blocks:
            print("\nPreview of indexed topics:")
            for i, block in enumerate(blocks[:3]):
                start_str = format_timestamp(block['start_time'])
                topic_title = block.get('topic_title', 'Section')
                print(f"  [{start_str}] {topic_title}")
            if len(blocks) > 3:
                print(f"  ... and {len(blocks) - 3} more topics. (Use 'show {video_id}' to view the full timeline)")
                
    except Exception as e:
        print(f"\nIndexing failed: {e}", file=sys.stderr)
        sys.exit(1)

def cmd_list(args):
    """Handler for the 'list' command."""
    videos = db.list_videos()
    if not videos:
        print("No videos have been indexed yet. Use 'index' to add your first video.")
        return
        
    print(f"{'VIDEO ID':<18} | {'FILE NAME':<30} | {'DURATION':<10} | {'INDEXED AT'}")
    print("-" * 80)
    for v in videos:
        duration_str = format_timestamp(v['duration'])
        # Extract date from iso format
        created = v['created_at'].replace('T', ' ')[:19]
        file_name = v['file_name']
        if len(file_name) > 30:
            file_name = file_name[:27] + "..."
        print(f"{v['id']:<18} | {file_name:<30} | {duration_str:<10} | {created}")

def cmd_show(args):
    """Handler for the 'show' command."""
    video = db.get_video(args.video_id)
    if not video:
        # Check if the user passed a file path instead of ID, resolve it
        video = db.get_video_by_path(args.video_id)
        if not video:
            print(f"Error: Video ID or Path '{args.video_id}' not found in index.", file=sys.stderr)
            sys.exit(1)
            
    video_id = video['id']
    blocks = db.get_video_blocks(video_id)
    
    print(f"Video: {video['file_name']}")
    print(f"ID: {video_id}")
    print(f"Duration: {format_timestamp(video['duration'])}")
    print(f"Total Topics: {len(blocks)}")
    print()
    print(f"{'CHAPTER ID':<20} | {'TIMESTAMP':<10} | {'KEY MOMENT TOPIC'}")
    print("-" * 85)
    
    for idx, block in enumerate(blocks, start=1):
        chapter_id = f"{video_id}-{idx}"
        start_str = format_timestamp(block['start_time'])
        topic_title = block.get('topic_title', 'Section')
        print(f" {chapter_id:<19} |  [{start_str}]  | {topic_title}")

def cmd_search(args):
    """Handler for the 'search' command."""
    video = db.get_video(args.video_id)
    if not video:
        video = db.get_video_by_path(args.video_id)
        if not video:
            print(f"Error: Video ID or Path '{args.video_id}' not found in index.", file=sys.stderr)
            sys.exit(1)
            
    video_id = video['id']
    query = args.query
    results = db.search_blocks(video_id, query)
    
    print(f"Searching for '{query}' in '{video['file_name']}'...")
    print(f"Found {len(results)} matching block(s):\n")
    
    for r in results:
        start_str = format_timestamp(r['start_time'])
        end_str = format_timestamp(r['end_time'])
        topic_title = r.get('topic_title', 'Section')
        
        # Highlight match in terminal (case insensitive but preserving case)
        text = r['text']
        lower_text = text.lower()
        lower_query = query.lower()
        
        highlighted = ""
        idx = 0
        while True:
            pos = lower_text.find(lower_query, idx)
            if pos == -1:
                highlighted += text[idx:]
                break
            highlighted += text[idx:pos]
            # Wrap match in uppercase and asterisks
            highlighted += f"**{text[pos:pos+len(query)].upper()}**"
            idx = pos + len(query)
            
        print(f"[{start_str} -> {end_str}] ({topic_title})")
        print(f"  {highlighted}")
        print()

def cmd_delete(args):
    """Handler for the 'delete' command."""
    video = db.get_video(args.video_id)
    if not video:
        video = db.get_video_by_path(args.video_id)
        if not video:
            print(f"Error: Video ID or Path '{args.video_id}' not found.", file=sys.stderr)
            sys.exit(1)
            
    video_id = video['id']
    if db.delete_video(video_id):
        print(f"Successfully deleted video '{video['file_name']}' (ID: {video_id}) and its blocks from the index.")
    else:
        print("Failed to delete video.", file=sys.stderr)
        sys.exit(1)

def cmd_analyse(args):
    """Handler for the 'analyse' command."""
    from src.indexer import analyse_video
    try:
        db_target = analyse_video(args.video_id)
        print(f"\nSuccess! Analysis completed.")
        print(f"Index updated in: {db_target}")
    except Exception as e:
        print(f"\nAnalysis failed: {e}", file=sys.stderr)
        sys.exit(1)

def cmd_summarize(args):
    """Handler for the 'summarize' command."""
    block_id_str = args.block_id.strip()
    block = None
    
    if "-" in block_id_str:
        # Format: video_id-index
        parts = block_id_str.rsplit("-", 1)
        if len(parts) == 2:
            video_id, idx_str = parts
            try:
                chapter_index = int(idx_str)
                if chapter_index < 1:
                    raise ValueError()
            except ValueError:
                print(f"Error: Chapter index in '{block_id_str}' must be a positive integer.", file=sys.stderr)
                sys.exit(1)
                
            # Fetch blocks sorted by start_time
            blocks = db.get_video_blocks(video_id)
            if not blocks:
                # Check if video exists at all
                video = db.get_video(video_id)
                if not video:
                    print(f"Error: Video ID '{video_id}' not found in database.", file=sys.stderr)
                else:
                    print(f"Error: Video '{video['file_name']}' has no indexed chapters.", file=sys.stderr)
                sys.exit(1)
                
            if chapter_index > len(blocks):
                print(f"Error: Chapter index {chapter_index} is out of range. Video has only {len(blocks)} chapters.", file=sys.stderr)
                sys.exit(1)
                
            block = blocks[chapter_index - 1]
    else:
        # Format: raw database ID
        try:
            block = db.get_semantic_block(block_id_str)
        except Exception:
            pass
            
    if not block:
        print(f"Error: Chapter ID '{block_id_str}' not found in database. Use format '<video_id>-<index>' (e.g. 0c1387473782fe33-1).", file=sys.stderr)
        sys.exit(1)
        
    # Get associated video details and calculate chapter_id
    video_id = block['video_id']
    video = db.get_video(video_id)
    video_name = video['file_name'] if video else "Unknown Video"
    
    # Calculate chapter_id dynamically
    all_video_blocks = db.get_video_blocks(video_id)
    block_index = 1
    for idx, b in enumerate(all_video_blocks, start=1):
        if b['id'] == block['id']:
            block_index = idx
            break
    chapter_id = f"{video_id}-{block_index}"
    
    start_str = format_timestamp(block['start_time'])
    end_str = format_timestamp(block['end_time'])
    
    print(f"Summarizing Chapter for: {video_name}")
    print(f"Topic: {block['topic_title']}")
    print(f"Time Range: [{start_str} -> {end_str}]")
    print("-" * 65)
    
    # Check if we have a cached summary in MongoDB first
    cached = db.get_summary(video_id, block['id'])
    if cached:
        print("\nSUMMARY (Cached in MongoDB):")
        print(cached["summary_text"])
        return
        
    transcript_text = block['text'].strip()
    if not transcript_text:
        print("This chapter has no transcript text to summarize.")
        return
        
    # Call Gemini to summarize
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    # Check if google-genai is installed
    from src.indexer import GEMINI_AVAILABLE
    if not GEMINI_AVAILABLE or not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
        print("[Warning] Gemini API is not configured or available. Printing raw text instead:")
        print(transcript_text)
        return
        
    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "You are a professional video content summarizer. "
            "Your task is to write a concise, bulleted summary of the provided chapter transcript. "
            "Highlight key takeaways, action items, and important ideas."
        )
        
        prompt = (
            f"Please summarize the following video chapter transcript:\n\n"
            f"Topic: {block['topic_title']}\n"
            f"Transcript:\n{transcript_text}"
        )
        
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
        print(f"[Summarizer] Querying {model_name} for summary...")
        
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2
                ),
            )
        except Exception as e:
            if model_name != "gemini-3.1-flash-lite":
                print(f"[Summarizer Warning] Model {model_name} failed: {e}. Retrying with fallback model gemini-3.1-flash-lite...")
                model_name = "gemini-3.1-flash-lite"
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2
                    ),
                )
            else:
                raise e
                
        summary_text = response.text.strip()
        print("\nSUMMARY:")
        print(summary_text)
        
        # Extract bullet points
        bullet_points = []
        for line in summary_text.splitlines():
            line_clean = line.strip()
            if line_clean.startswith(("-", "*", "•")):
                bullet_points.append(line_clean.lstrip("-*• ").strip())
                
        # Save summary to MongoDB
        db.insert_summary(
            video_id=video_id,
            index_id=block['id'],
            raw_text_chunk=transcript_text,
            summary_text=summary_text,
            bullet_points=bullet_points
        )
        
        print(f"\n[Summarizer] Summary successfully saved to MongoDB database.")
        
    except Exception as e:
        print(f"[Summarizer Error] Failed to generate summary: {e}")
        print("\nRaw Transcript Text:")
        print(transcript_text)

def main():
    parser = argparse.ArgumentParser(
        description="Offline-First Video Chapter Indexer",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True, help="Subcommands")

    # index command
    p_index = subparsers.add_parser("index", help="Extract audio, transcribe, chunk, and index a video file")
    p_index.add_argument("video_path", help="Path to local video file")
    p_index.add_argument("-l", "--language", help="Specify language code (e.g., 'en' for English)")
    p_index.set_defaults(func=cmd_index)

    # list command
    p_list = subparsers.add_parser("list", help="List all indexed videos")
    p_list.set_defaults(func=cmd_list)

    # show command
    p_show = subparsers.add_parser("show", help="Show all indexed semantic blocks for a video")
    p_show.add_argument("video_id", help="Video ID (or path) to show blocks for")
    p_show.set_defaults(func=cmd_show)

    # search command
    p_search = subparsers.add_parser("search", help="Search video transcripts for a keyword")
    p_search.add_argument("video_id", help="Video ID (or path) to search within")
    p_search.add_argument("query", help="Keyword query to search for")
    p_search.set_defaults(func=cmd_search)

    # delete command
    p_delete = subparsers.add_parser("delete", help="Remove a video and its blocks from the index")
    p_delete.add_argument("video_id", help="Video ID (or path) to delete")
    p_delete.set_defaults(func=cmd_delete)

    # analyse command
    p_analyse = subparsers.add_parser("analyse", help="Analyse transcript using Gemini to generate topic boundaries")
    p_analyse.add_argument("video_id", help="Video ID (or path) to analyse")
    p_analyse.set_defaults(func=cmd_analyse)

    # summarize command
    p_summarize = subparsers.add_parser("summarize", help="Generate a Gemini summary for a specific chapter/block ID")
    p_summarize.add_argument("block_id", help="The unique chapter/block ID from the timeline")
    p_summarize.set_defaults(func=cmd_summarize)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
