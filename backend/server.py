import http.server
import socketserver
import json
import os
import urllib.parse
import mimetypes
import sys
import re

# Define FRONTEND_DIR pointing to the Vite build directory
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

# Add current workspace to path to import src modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import src.database as db
from src.indexer import index_video, analyse_video
from main import format_timestamp

PORT = 8000

<<<<<<< HEAD

def normalize_summary_text(text: str) -> str:
    """Remove markdown emphasis markers from generated summaries."""
    if not text:
        return text

    cleaned_lines = []
    for line in text.splitlines():
        stripped = line.lstrip()
        indent = line[:len(line) - len(stripped)]

        if stripped.startswith("* "):
            stripped = f"- {stripped[2:]}"
        elif stripped.startswith("• "):
            stripped = f"- {stripped[2:]}"

        stripped = stripped.replace("**", "").replace("*", "")
        cleaned_lines.append(f"{indent}{stripped}")

    return "\n".join(cleaned_lines).strip()
=======
def resolve_local_file_path(video_path):
    if not video_path:
        return None
    # If the path already exists, return its absolute path
    if os.path.exists(video_path):
        return os.path.abspath(video_path)
        
    filename = os.path.basename(video_path)
    
    # 1. Search common user directories on Windows (Downloads, Documents, Videos)
    home_dir = os.path.expanduser("~")
    common_dirs = [
        os.path.join(home_dir, "Downloads"),
        os.path.join(home_dir, "Documents"),
        os.path.join(home_dir, "Videos"),
    ]
    for c_dir in common_dirs:
        if os.path.exists(c_dir):
            direct_check = os.path.join(c_dir, filename)
            if os.path.exists(direct_check) and os.path.isfile(direct_check):
                print(f"[Resolver] Resolved '{video_path}' to '{direct_check}'")
                return direct_check
                
    # 2. Search project workspace
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(backend_dir)
    for root, dirs, files in os.walk(workspace_dir):
        # Skip standard large/ignored directories
        dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', 'dist', 'temp', 'data']]
        if filename in files:
            resolved_path = os.path.join(root, filename)
            print(f"[Resolver] Resolved '{video_path}' to '{resolved_path}'")
            return resolved_path
            
    return None
>>>>>>> ef512fc7f90f2c33c6707191c6dc914b39355994

class LocalAPIRequestHandler(http.server.BaseHTTPRequestHandler):
    def _get_owner_email(self, parsed_url, body=None):
        query_params = urllib.parse.parse_qs(parsed_url.query)
        owner_email = query_params.get("owner_email", [""])[0].strip()
        if not owner_email and isinstance(body, dict):
            owner_email = str(body.get("owner_email", "")).strip()
        return owner_email

    def _sanitize_owner_slug(self, owner_email: str) -> str:
        slug = owner_email.strip().lower()
        slug = slug.replace("@", "_at_")
        slug = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in slug)
        return slug or "anonymous"

    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Route API requests
        if path.startswith("/api/"):
            if path == "/api/stream-local-video":
                self.handle_stream_local_video(parsed_url)
            else:
                self.handle_api_get(path, parsed_url)
        else:
            self.handle_static_get(path)

    def handle_stream_local_video(self, parsed_url):
        query_params = urllib.parse.parse_qs(parsed_url.query)
        video_path = query_params.get("path", [""])[0].strip()
        
        if not video_path:
            self.send_json_response({"error": "path parameter is required"}, 400)
            return
            
        if not os.path.exists(video_path) or not os.path.isfile(video_path):
            self.send_json_response({"error": f"Local video file not found at path: {video_path}"}, 404)
            return
            
        try:
            file_size = os.path.getsize(video_path)
            content_type, _ = mimetypes.guess_type(video_path)
            if not content_type:
                content_type = "video/mp4"
                
            range_header = self.headers.get("Range")
            
            if range_header and range_header.startswith("bytes="):
                # Parse Range header: e.g., bytes=0-1000, bytes=1000-, bytes=-1000
                range_val = range_header.split("=")[1].strip()
                parts = range_val.split("-")
                start_str = parts[0].strip()
                end_str = parts[1].strip() if len(parts) > 1 else ""
                
                if not start_str and not end_str:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.end_headers()
                    return
                    
                if start_str:
                    start = int(start_str)
                else:
                    start = file_size - int(end_str)
                    
                if end_str:
                    end = int(end_str)
                else:
                    end = file_size - 1
                    
                # Sanitize ranges
                if start < 0 or start >= file_size or end < start:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.end_headers()
                    return
                    
                if end >= file_size:
                    end = file_size - 1
                    
                chunk_length = end - start + 1
                
                self.send_response(206)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(chunk_length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                
                # Stream the chunk
                with open(video_path, "rb") as f:
                    f.seek(start)
                    remaining = chunk_length
                    buffer_size = 64 * 1024
                    while remaining > 0:
                        chunk_to_read = min(buffer_size, remaining)
                        data = f.read(chunk_to_read)
                        if not data:
                            break
                        self.wfile.write(data)
                        remaining -= len(data)
            else:
                # Standard full file response
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                
                with open(video_path, "rb") as f:
                    buffer_size = 64 * 1024
                    while True:
                        data = f.read(buffer_size)
                        if not data:
                            break
                        self.wfile.write(data)
        except Exception as e:
            # Handle socket errors / connection resets gracefully
            print(f"[Streaming Info] Streaming connection reset or failed: {e}")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/"):
            # Intercept raw file uploads before JSON parsing
            if path == "/api/upload":
                self.handle_raw_upload(parsed_url)
                return

            # Read content length
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else b""
            
            try:
                body = json.loads(post_data.decode('utf-8')) if post_data else {}
            except json.JSONDecodeError:
                self.send_json_response({"error": "Invalid JSON request body"}, 400)
                return

            self.handle_api_post(path, body, parsed_url)
        else:
            self.send_error(405, "Method Not Allowed")

    def handle_raw_upload(self, parsed_url):
        query_params = urllib.parse.parse_qs(parsed_url.query)
        filename = query_params.get("filename", [""])[0].strip()
        owner_email = self._get_owner_email(parsed_url)
        
        if not filename:
            self.send_json_response({"error": "filename parameter is required in query string"}, 400)
            return
        if not owner_email:
            self.send_json_response({"error": "owner_email parameter is required"}, 400)
            return
            
        safe_filename = os.path.basename(filename)
        if not safe_filename:
            self.send_json_response({"error": "Invalid filename"}, 400)
            return
            
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            uploads_dir = os.path.join(base_dir, "data", "uploads", self._sanitize_owner_slug(owner_email))
            os.makedirs(uploads_dir, exist_ok=True)
            
            file_path = os.path.join(uploads_dir, safe_filename)
            
            # Read content length
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_json_response({"error": "Content-Length must be greater than 0"}, 400)
                return
            
            print(f"[Server API] Uploading file '{safe_filename}' ({content_length} bytes) to: {file_path} ...")
            
            # Read raw bytes in chunks to prevent memory issues for large files
            remaining_bytes = content_length
            chunk_size = 64 * 1024 # 64KB chunks
            
            with open(file_path, 'wb') as f:
                while remaining_bytes > 0:
                    read_size = min(chunk_size, remaining_bytes)
                    chunk = self.rfile.read(read_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining_bytes -= len(chunk)
                    
            if remaining_bytes > 0:
                self.send_json_response({"error": "Upload interrupted before completion"}, 500)
                return
                
            print(f"[Server API] Upload completed: {file_path}")
            self.send_json_response({
                "success": True,
                "file_path": file_path,
                "file_name": safe_filename,
                "owner_email": owner_email,
                "message": "File uploaded successfully."
            })
        except Exception as e:
            self.send_json_response({"error": f"Upload failed: {e}"}, 500)

    def handle_static_get(self, path):
        # Default to index.html
        if path == "/" or path == "":
            path = "/index.html"
        
        # Clean path to prevent path traversal vulnerability
        clean_path = os.path.normpath(path).lstrip("/\\")
        file_path = os.path.join(FRONTEND_DIR, clean_path)

        # Ensure absolute paths for secure validation on Windows
        abs_frontend_dir = os.path.abspath(FRONTEND_DIR)
        abs_file_path = os.path.abspath(file_path)

        # Check if file exists and is within frontend directory
        if not abs_file_path.startswith(abs_frontend_dir) or not os.path.exists(abs_file_path) or os.path.isdir(abs_file_path):
            self.send_error(404, "File Not Found")
            return

        # Guess MIME type
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {e}")

    def handle_api_get(self, path, parsed_url):
        # Initialize database tables
        db.init_db()

        # Endpoint: GET /api/local-files
        if path == "/api/local-files":
            try:
                base_dir = os.path.dirname(os.path.abspath(__file__))
                media_files = []
                allowed_exts = ('.mp3', '.mp4', '.wav', '.mkv', '.mov', '.m4a')
                ignored_dirs = {'.git', 'node_modules', 'frontend', 'temp', 'transcripts', 'analysed', 'summaries', 'data'}
                
                # 1. Scan root directory up to 3 levels deep
                for root, dirs, files in os.walk(base_dir):
                    dirs[:] = [d for d in dirs if d not in ignored_dirs]
                    
                    rel_path = os.path.relpath(root, base_dir)
                    depth = 0 if rel_path == '.' else len(rel_path.split(os.sep))
                    if depth > 3:
                        dirs[:] = []
                        continue
                        
                    for file in files:
                        if file.lower().endswith(allowed_exts):
                            full_path = os.path.join(root, file)
                            media_files.append({
                                "name": file,
                                "path": full_path,
                                "rel_path": os.path.relpath(full_path, base_dir)
                            })
                
                # 2. Also scan data/uploads directory specifically
                uploads_dir = os.path.join(base_dir, "data", "uploads")
                if os.path.exists(uploads_dir):
                    for file in os.listdir(uploads_dir):
                        if file.lower().endswith(allowed_exts):
                            full_path = os.path.join(uploads_dir, file)
                            media_files.append({
                                "name": file,
                                "path": full_path,
                                "rel_path": os.path.relpath(full_path, base_dir)
                            })
                            
                self.send_json_response(media_files)
            except Exception as e:
                self.send_json_response({"error": f"Failed to list local files: {e}"}, 500)
            return

        # Endpoint: GET /api/videos
        if path == "/api/videos":
            owner_email = self._get_owner_email(parsed_url)
            if not owner_email:
                self.send_json_response({"error": "owner_email parameter is required"}, 400)
                return
            try:
                videos = db.list_videos(owner_email)
                video_list = []
                for v in videos:
                    video_list.append({
                        "id": v["id"],
                        "file_name": v["file_name"],
                        "file_path": v["file_path"],
                        "absolute_local_path": v.get("absolute_local_path", ""),
                        "timeline_index": v.get("timeline_index", []),
                        "duration": v["duration"],
                        "duration_str": format_timestamp(v["duration"]),
                        "created_at": v["created_at"]
                    })
                self.send_json_response(video_list)
            except Exception as e:
                self.send_json_response({"error": f"Failed to list videos: {e}"}, 500)
            return

        # Endpoint: GET /api/videos/<video_id>
        if path.startswith("/api/videos/"):
            video_id = path[len("/api/videos/"):]
            if not video_id:
                self.send_json_response({"error": "Video ID required"}, 400)
                return

            owner_email = self._get_owner_email(parsed_url)
            if not owner_email:
                self.send_json_response({"error": "owner_email parameter is required"}, 400)
                return

            try:
                video = db.get_video(video_id, owner_email)
                if not video:
                    self.send_json_response({"error": "Video not found"}, 404)
                    return

                blocks = db.get_video_blocks(video_id)
                
                # Format chapters list
                chapters = []
                for idx, b in enumerate(blocks, start=1):
                    chapters.append({
                        "id": f"{video_id}-{idx}",
                        "db_id": b["id"],
                        "start_time": b["start_time"],
                        "start_time_str": format_timestamp(b["start_time"]),
                        "end_time": b["end_time"],
                        "end_time_str": format_timestamp(b["end_time"]),
                        "topic_title": b.get("topic_title", "Section"),
                        "text": b["text"]
                    })

                response_data = {
                    "video": {
                        "id": video["id"],
                        "file_name": video["file_name"],
                        "file_path": video["file_path"],
                        "absolute_local_path": video.get("absolute_local_path", ""),
                        "timeline_index": video.get("timeline_index", []),
                        "duration": video["duration"],
                        "duration_str": format_timestamp(video["duration"]),
                        "overall_summary": video.get("overall_summary", "")
                    },
                    "chapters": chapters
                }
                self.send_json_response(response_data)
            except Exception as e:
                self.send_json_response({"error": f"Failed to fetch video: {e}"}, 500)
            return

        # Endpoint: GET /api/search
        if path == "/api/search":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            video_id = query_params.get("video_id", [""])[0]
            query = query_params.get("query", [""])[0]
            owner_email = self._get_owner_email(parsed_url)

            if not video_id or not query:
                self.send_json_response({"error": "video_id and query params are required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email parameter is required"}, 400)
                return

            try:
                video = db.get_video(video_id, owner_email)
                if not video:
                    self.send_json_response({"error": "Video not found"}, 404)
                    return

                results = db.search_blocks(video_id, query)
                formatted_results = []
                
                # Fetch all blocks to find chronological 1-based index
                all_blocks = db.get_video_blocks(video_id)
                block_id_to_idx = {b["id"]: idx for idx, b in enumerate(all_blocks, start=1)}

                for r in results:
                    idx = block_id_to_idx.get(r["id"], 1)
                    formatted_results.append({
                        "id": f"{video_id}-{idx}",
                        "db_id": r["id"],
                        "start_time": r["start_time"],
                        "start_time_str": format_timestamp(r["start_time"]),
                        "end_time": r["end_time"],
                        "end_time_str": format_timestamp(r["end_time"]),
                        "topic_title": r.get("topic_title", "Section"),
                        "text": r["text"]
                    })
                self.send_json_response(formatted_results)
            except Exception as e:
                self.send_json_response({"error": f"Search failed: {e}"}, 500)
            return

        self.send_json_response({"error": "Endpoint not found"}, 404)

    def handle_api_post(self, path, body, parsed_url=None):
        owner_email = self._get_owner_email(parsed_url, body) if parsed_url else str(body.get("owner_email", "")).strip()

        # Endpoint: POST /api/delete
        if path == "/api/delete":
            video_id = body.get("video_id", "").strip()
            if not video_id:
                self.send_json_response({"error": "video_id is required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email is required"}, 400)
                return
            try:
                print(f"[Server API] Deleting video ID: {video_id} ...")
                if db.delete_video(video_id, owner_email):
                    self.send_json_response({
                        "success": True,
                        "message": f"Successfully deleted video '{video_id}'."
                    })
                else:
                    self.send_json_response({"error": "Failed to delete video from database"}, 500)
            except Exception as e:
                self.send_json_response({"error": f"Deletion failed: {e}"}, 500)
            return

        # Endpoint: POST /api/index
        if path == "/api/index":
            video_path = body.get("video_path", "").strip()
            language = body.get("language")
            if not language or language.strip() == "":
                language = None
            else:
                language = language.strip()

            if not video_path:
                self.send_json_response({"error": "video_path is required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email is required"}, 400)
                return

            resolved_path = resolve_local_file_path(video_path)
            if not resolved_path:
                self.send_json_response({"error": f"Local video file not found at path or in common folders: {video_path}"}, 404)
                return

            try:
                print(f"[Server API] Indexing video: {resolved_path} ...")
                video_id, blocks = index_video(resolved_path, language=language, owner_email=owner_email)
                
                # Automatically run semantic topic boundary analysis using Gemini
                try:
                    print(f"[Server API] Automatically analyzing video ID: {video_id} ...")
                    analyse_video(video_id, owner_email=owner_email)
                except Exception as ex:
                    print(f"[Server API Warning] Automatic boundary analysis failed: {ex}")
                
                self.send_json_response({
                    "success": True,
                    "video_id": video_id,
                    "message": "Successfully indexed video and ran semantic boundary analysis."
                })
            except Exception as e:
                self.send_json_response({"error": f"Failed to index video: {e}"}, 500)
            return

        # Endpoint: POST /api/analyse
        if path == "/api/analyse":
            video_id = body.get("video_id", "").strip()
            if not video_id:
                self.send_json_response({"error": "video_id is required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email is required"}, 400)
                return

            try:
                print(f"[Server API] Running Gemini analysis for video ID: {video_id} ...")
                analysed_path = analyse_video(video_id, owner_email=owner_email)
                self.send_json_response({
                    "success": True,
                    "analysed_path": analysed_path,
                    "message": "Gemini topic boundaries analysis completed successfully."
                })
            except Exception as e:
                self.send_json_response({"error": f"Analysis failed: {e}"}, 500)
            return

        # Endpoint: POST /api/summarize
        if path == "/api/summarize":
            chapter_id = body.get("chapter_id", "").strip()
            if not chapter_id:
                self.send_json_response({"error": "chapter_id is required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email is required"}, 400)
                return

            try:
                # Resolve block
                block = None
                if "-" in chapter_id:
                    parts = chapter_id.rsplit("-", 1)
                    if len(parts) == 2:
                        video_id, idx_str = parts
                        chapter_index = int(idx_str)
                        if not db.get_video(video_id, owner_email):
                            self.send_json_response({"error": f"Chapter with ID '{chapter_id}' not found"}, 404)
                            return
                        blocks = db.get_video_blocks(video_id)
                        if blocks and 1 <= chapter_index <= len(blocks):
                            block = blocks[chapter_index - 1]
                else:
                    try:
                        block = db.get_semantic_block(chapter_id)
                    except ValueError:
                        block = None

                if not block:
                    self.send_json_response({"error": f"Chapter with ID '{chapter_id}' not found"}, 404)
                    return

                video_id = block["video_id"]
                if not db.get_video(video_id, owner_email):
                    self.send_json_response({"error": f"Chapter with ID '{chapter_id}' not found"}, 404)
                    return

                # Calculate resolved 1-based index chapter_id
                all_blocks = db.get_video_blocks(video_id)
                block_index = 1
                for idx, b in enumerate(all_blocks, start=1):
                    if b['id'] == block['id']:
                        block_index = idx
                        break
                resolved_chapter_id = f"{video_id}-{block_index}"

                from src.config import get_summaries_dir
                summaries_dir = get_summaries_dir()
                summary_filename = f"{video_id}_{resolved_chapter_id}_summary.txt"
                summary_filepath = os.path.join(summaries_dir, summary_filename)

                # Return cached summary if it exists
                if os.path.exists(summary_filepath):
                    with open(summary_filepath, 'r', encoding='utf-8') as sf:
                        cached_content = sf.read()
                    # Parse out headers
                    parts = cached_content.split("=" * 65 + "\n\n", 1)
                    summary_text = parts[1] if len(parts) == 2 else cached_content
                    summary_text = normalize_summary_text(summary_text)
                    self.send_json_response({
                        "summary": summary_text,
                        "chapter_id": resolved_chapter_id,
                        "cached": True
                    })
                    return

                # Otherwise call Gemini API to generate
                transcript_text = block["text"].strip()
                if not transcript_text:
                    self.send_json_response({"error": "Chapter has no transcript text"}, 400)
                    return

                api_key = os.getenv("GEMINI_API_KEY", "").strip()
                from src.indexer import GEMINI_AVAILABLE
                if not GEMINI_AVAILABLE or not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
                    self.send_json_response({
                        "summary": f"**[Gemini API not configured]**\n\nRaw Transcript:\n{transcript_text}",
                        "chapter_id": resolved_chapter_id,
                        "cached": False
                    })
                    return

                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)
                system_instruction = (
                    "You are a professional video content summarizer. "
                    "Your task is to write a concise, bulleted summary of the provided chapter transcript. "
                    "Highlight key takeaways, use-cases, and explanations."
                )
                prompt = (
                    f"Please summarize the following video chapter transcript:\n\n"
                    f"Topic: {block['topic_title']}\n"
                    f"Transcript:\n{transcript_text}"
                )
                model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()

                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.2
                        ),
                    )
                except Exception as api_err:
                    if model_name != "gemini-3.1-flash-lite":
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
                        raise api_err

                summary_text = normalize_summary_text(response.text.strip())

                # Extract bullet points
                bullet_points = []
                for line in summary_text.splitlines():
                    line_clean = line.strip()
                    if line_clean.startswith(("-", "*", "•")):
                        bullet_points.append(line_clean.lstrip("-*• ").strip())

                # Write cache to MongoDB
                db.insert_summary(
                    video_id=video_id,
                    index_id=block['id'],
                    raw_text_chunk=transcript_text,
                    summary_text=summary_text,
                    bullet_points=bullet_points
                )

                self.send_json_response({
                    "summary": summary_text,
                    "chapter_id": resolved_chapter_id,
                    "cached": False
                })
            except Exception as e:
                self.send_json_response({"error": f"Summarization failed: {e}"}, 500)
            return

        # Endpoint: POST /api/overall-summary
        if path == "/api/overall-summary":
            video_id = body.get("video_id", "").strip()
            if not video_id:
                self.send_json_response({"error": "video_id is required"}, 400)
                return
            if not owner_email:
                self.send_json_response({"error": "owner_email is required"}, 400)
                return

            try:
                # 1. Fetch video details
                video = db.get_video(video_id, owner_email)
                if not video:
                    self.send_json_response({"error": "Video not found"}, 404)
                    return

                if video.get("overall_summary"):
                    self.send_json_response({
                        "success": True,
                        "overall_summary": video["overall_summary"],
                        "cached": True
                    })
                    return

                # 2. Get video blocks
                blocks = db.get_video_blocks(video_id)
                if not blocks:
                    self.send_json_response({"error": "No indexed chapters found for this video"}, 400)
                    return

                # 3. Build text representing all chapters
                chapters_text = []
                for idx, b in enumerate(blocks, start=1):
                    start_str = format_timestamp(b['start_time'])
                    chapters_text.append(
                        f"Chapter {idx}: {b['topic_title']} [{start_str}]\nTranscript: {b['text']}"
                    )
                full_chapters_text = "\n\n".join(chapters_text)

                api_key = os.getenv("GEMINI_API_KEY", "").strip()
                from src.indexer import GEMINI_AVAILABLE
                if not GEMINI_AVAILABLE or not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
                    self.send_json_response({"error": "Gemini API is not configured. Cannot generate overall summary."}, 400)
                    return

                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)
                system_instruction = (
                    "You are a professional video content summarizer. "
                    "Your task is to write a cohesive, comprehensive section-by-section overall summary "
                    "of the entire video based on the provided chapter transcripts. "
                    "Provide clear section headers and key takeaways for each part."
                )
                prompt = (
                    f"Please generate a comprehensive overall summary for the following video chapters:\n\n"
                    f"Video Title: {video['file_name']}\n\n"
                    f"{full_chapters_text}"
                )
                model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()

                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.2
                        ),
                    )
                except Exception as api_err:
                    if model_name != "gemini-3.1-flash-lite":
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
                        raise api_err

                overall_summary = response.text.strip()

                # Update Catalog in MongoDB
                db.update_overall_summary(video_id, overall_summary)

                self.send_json_response({
                    "success": True,
                    "overall_summary": overall_summary,
                    "cached": False
                })
            except Exception as e:
                self.send_json_response({"error": f"Overall summary generation failed: {e}"}, 500)
            return

        self.send_json_response({"error": "Endpoint not found"}, 404)

    def send_json_response(self, data, status_code=200):
        try:
            response_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(response_bytes))
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            print(f"[Server Error] Failed to send JSON response: {e}")

def run_server():
    db.init_db()
    if not os.path.exists(FRONTEND_DIR):
        os.makedirs(FRONTEND_DIR)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LocalAPIRequestHandler) as httpd:
        print(f"[Server] Video Chapter Indexer API is running on port {PORT}!")
        print(f"[Server] API endpoints are mounted at http://localhost:{PORT}/api/")
        print("[Server] Press Ctrl+C to terminate the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[Server] Shutting down...")

if __name__ == "__main__":
    run_server()
