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
    print(f"{'TIMESTAMP':<10} | {'KEY MOMENT TOPIC'}")
    print("-" * 65)
    
    for block in blocks:
        start_str = format_timestamp(block['start_time'])
        topic_title = block.get('topic_title', 'Section')
        print(f" {f'[{start_str}]':<9} | {topic_title}")

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
        analysed_path = analyse_video(args.video_id)
        print(f"\nSuccess! Analysis completed.")
        print(f"Output saved to: {analysed_path}")
    except Exception as e:
        print(f"\nAnalysis failed: {e}", file=sys.stderr)
        sys.exit(1)

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

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
