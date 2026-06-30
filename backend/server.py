import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import json
import urllib.parse
import mimetypes
import sys
import asyncio
import io
from fastapi import FastAPI, Request, Query, HTTPException, Response, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

# Define FRONTEND_DIR pointing to the Vite build directory
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

# Add current workspace to path to import src modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import src.database as db
from src.database import VideoCancelledException
from src.indexer import index_video, analyse_video
from main import format_timestamp
import queue
import threading

# Global task queue
indexing_queue = queue.Queue()

def run_pipeline_task(video_id: str, payload_dict: dict, owner_email: str):
    s3_key = payload_dict.get("s3_key", "")
    s3_bucket = payload_dict.get("s3_bucket", "")
    grid_fs_id = payload_dict.get("grid_fs_id", "")
    video_path = payload_dict.get("video_path", "")
    language = payload_dict.get("language")
    playlist_id = payload_dict.get("playlist_id")
    
    try:
        # Option A: AWS S3
        if s3_key:
            from src.s3 import generate_s3_download_url
            
            bucket = s3_bucket if s3_bucket else os.getenv("AWS_S3_BUCKET")
            if not bucket:
                raise ValueError("S3 bucket configuration is missing")
                
            safe_filename = os.path.basename(s3_key)
            print(f"[Queue Worker] Generating secure download URL for S3 key '{s3_key}'...")
            
            # Generate a temporary URL valid for 1 hour (3600 seconds)
            video_url = generate_s3_download_url(s3_key, expires_in=3600)
            if not video_url:
                db.update_upload_status(video_id, "failed_uploading")
                raise ValueError("Failed to generate S3 pre-signed URL for video streaming.")
                
            print(f"[Queue Worker] Indexing S3 video via direct streaming: {s3_key} ...")
            index_video(
                video_url,
                language=language,
                owner_email=owner_email,
                original_filename=safe_filename,
                s3_key=s3_key,
                s3_bucket=bucket,
                playlist_id=playlist_id,
                upload_status="indexing"
            )
                    
        # Option B: GridFS
        elif grid_fs_id:
            import gridfs
            from bson.objectid import ObjectId
            from src.database import get_db
            from src.config import get_temp_dir
            
            mongo_db = get_db()
            fs = gridfs.GridFS(mongo_db)
            
            try:
                grid_out = fs.get(ObjectId(grid_fs_id))
            except Exception as e:
                db.update_upload_status(video_id, "failed_uploading")
                raise ValueError(f"GridFS file not found: {e}")
                
            temp_dir = get_temp_dir()
            safe_filename = os.path.basename(grid_out.filename)
            temp_video_path = os.path.join(temp_dir, f"temp_{grid_fs_id}_{safe_filename}")
            
            print(f"[Queue Worker] Buffering GridFS file to temp path: {temp_video_path} ...")
            with open(temp_video_path, 'wb') as temp_file:
                temp_file.write(grid_out.read())
                
            try:
                print(f"[Queue Worker] Indexing GridFS video: {grid_out.filename} ...")
                index_video(
                    temp_video_path,
                    language=language,
                    owner_email=owner_email,
                    grid_fs_id=grid_fs_id,
                    original_filename=grid_out.filename,
                    playlist_id=playlist_id,
                    upload_status="indexing"
                )
            finally:
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                    print(f"[Queue Worker] Cleaned up temporary video file: {temp_video_path}")
                    
        # Option C: Local path
        else:
            if not video_path:
                raise ValueError("video_path, s3_key, or grid_fs_id is required")
                
            resolved_path = resolve_local_file_path(video_path)
            if not resolved_path:
                raise ValueError(f"Local video file not found at path: {video_path}")
                
            print(f"[Queue Worker] Indexing video: {resolved_path} ...")
            index_video(resolved_path, language=language, owner_email=owner_email, playlist_id=playlist_id, upload_status="indexing")
            
        # Common post-index steps
        try:
            db.update_upload_status(video_id, "Summarizing")
            print(f"[Queue Worker] Automatically analyzing video ID: {video_id} ...")
            analyse_video(video_id, owner_email=owner_email)
        except Exception as ex:
            print(f"[Queue Worker Warning] Automatic boundary analysis failed: {ex}")
            db.update_upload_status(video_id, "failed_summarizing")
            raise ex
            
        try:
            print(f"[Queue Worker] Automatically generating overall summary for video ID: {video_id} ...")
            generate_overall_summary(video_id, owner_email=owner_email)
        except Exception as ex:
            print(f"[Queue Worker Warning] Automatic overall summary generation failed: {ex}")
            db.update_upload_status(video_id, "failed_summarizing")
            raise ex
            
        db.update_upload_status(video_id, "indexed")
        
    except VideoCancelledException as vce:
        raise vce
    except Exception as e:
        print(f"[Queue Worker Error] Failed to complete background indexing pipeline for video {video_id}: {e}")
        # Only overwrite to general 'failed' if not already set to a granular stage-specific failure status
        current = db.get_video(video_id, owner_email)
        if current and not current.get("upload_status", "").startswith("failed_"):
            db.update_upload_status(video_id, "failed")

def queue_worker():
    while True:
        try:
            task = indexing_queue.get()
            if task is None:
                break
            
            video_id, payload_dict, owner_email = task
            
            # Check if video was cancelled/deleted from database before starting
            db.init_db()
            if not db.get_video(video_id, owner_email):
                print(f"[Queue Worker] Video {video_id} was deleted/cancelled before starting. Skipping.")
                continue
                
            print(f"[Queue Worker] Starting background processing for video: {video_id} ...")
            
            # Update status to indexing
            db.update_upload_status(video_id, "indexing")
            
            # Run the processing pipeline
            run_pipeline_task(video_id, payload_dict, owner_email)
            
            print(f"[Queue Worker] Completed processing for video: {video_id}")
        except VideoCancelledException as vce:
            print(f"[Queue Worker Info] Processing of video {video_id} was cancelled by user: {vce}")
        except Exception as e:
            print(f"[Queue Worker Error] Error processing task: {e}")
        finally:
            indexing_queue.task_done()

# Start background worker thread
worker_thread = threading.Thread(target=queue_worker, daemon=True)
worker_thread.start()

PORT = 8000

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

def generate_overall_summary(video_id: str, owner_email: str) -> str:
    """Generates the overall summary of a video using Gemini and saves it to the database."""
    video = db.get_video(video_id, owner_email)
    if not video:
        raise ValueError("Video not found")
        
    blocks = db.get_video_blocks(video_id)
    if not blocks:
        raise ValueError("No indexed chapters found for this video")
        
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
        raise ValueError("Gemini API is not configured")
        
    from google import genai
    from google.genai import types
    
    client = genai.Client(api_key=api_key)
    system_instruction = (
        "You are a professional video content summarizer. "
        "Your task is to write a highly concise, brief, and minimized overall summary "
        "of the entire video based on the provided chapter transcripts. "
        "Keep the summary extremely short, effective, clear, and straight to the point (no fluff). "
        "Do NOT write it section-wise, chapter-wise, or with section headers/numbers. "
        "Synthesize all critical details into a brief unified narrative."
    )
    prompt = (
        f"Please generate a highly concise and minimized overall summary "
        f"for the following video, capturing only the most important takeaways in a clear, brief narrative:\n\n"
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
    db.update_overall_summary(video_id, overall_summary)
    return overall_summary


# FastAPI initialization
app = FastAPI(title="Summarix API", docs_url="/api/docs", redoc_url="/api/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AsyncStreamReader(io.RawIOBase):
    def __init__(self, request: Request, loop):
        self.request = request
        self.loop = loop
        self.generator = request.stream()
        self.buffer = b""

    def readable(self):
        return True

    def read(self, size=-1):
        if size < 0:
            size = 64 * 1024
            
        while len(self.buffer) < size:
            try:
                coro = anext(self.generator)
                chunk = asyncio.run_coroutine_threadsafe(coro, self.loop).result()
                if not chunk:
                    break
                self.buffer += chunk
            except StopAsyncIteration:
                break
            except Exception as e:
                print(f"[Upload Error] Error in stream reader: {e}")
                break
                
        if not self.buffer:
            return b""
            
        read_amt = min(size, len(self.buffer))
        chunk = self.buffer[:read_amt]
        self.buffer = self.buffer[read_amt:]
        return chunk


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str
    username: Optional[str] = ""

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/register")
def register_endpoint(payload: RegisterRequest):
    db.init_db()
    email = payload.email.strip()
    password = payload.password
    role = payload.role.strip().lower()
    username = payload.username.strip() if payload.username else ""
    
    if not email or not password or not role:
        raise HTTPException(status_code=400, detail="Email, password, and role are required")
        
    if role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    user = db.create_user(email, password, role, username)
    if not user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
        
    return {
        "success": True,
        "email": user["email"],
        "username": user["username"],
        "role": user["role"],
        "message": "User registered successfully"
    }

@app.post("/api/auth/login")
def login_endpoint(payload: LoginRequest):
    db.init_db()
    username = payload.username.strip()
    password = payload.password
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")
        
    user = db.authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    return {
        "success": True,
        "email": user["email"],
        "username": user["username"],
        "role": user["role"],
        "message": "Login successful"
    }


@app.get("/api/local-files")
def get_local_files():
    db.init_db()
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        media_files = []
        allowed_exts = ('.mp3', '.mp4', '.wav', '.mkv', '.mov', '.m4a')
        ignored_dirs = {'.git', 'node_modules', 'frontend', 'temp', 'transcripts', 'analysed', 'summaries', 'data'}
        
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
        return media_files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list local files: {e}")


@app.get("/api/videos")
def list_videos(
    owner_email: Optional[str] = Query(None),
    role: str = Query("user"),
    all_videos: bool = Query(False, alias="all")
):
    db.init_db()
    try:
        email = "" if all_videos else (owner_email or "")
        videos = db.list_videos(email, role)
        video_list = []
        for v in videos:
            video_list.append({
                "id": v["id"],
                "file_name": v["file_name"],
                "file_path": v["file_path"],
                "playlist_id": v.get("playlist_id", None),
                "upload_status": v.get("upload_status", "pending"),
                "absolute_local_path": v.get("absolute_local_path", ""),
                "timeline_index": v.get("timeline_index", []),
                "duration": v["duration"],
                "duration_str": format_timestamp(v["duration"]),
                "owner_email": v.get("owner_email", ""),
                "created_at": v["created_at"]
            })
        return video_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list videos: {e}")


@app.get("/api/videos/{video_id}")
def get_video(video_id: str, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        video = db.get_video(video_id, owner_email, role)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
            
        blocks = db.get_video_blocks(video_id)
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
            
        return {
            "video": {
                "id": video["id"],
                "file_name": video["file_name"],
                "file_path": video["file_path"],
                "playlist_id": video.get("playlist_id", None),
                "upload_status": video.get("upload_status", "pending"),
                "absolute_local_path": video.get("absolute_local_path", ""),
                "timeline_index": video.get("timeline_index", []),
                "duration": video["duration"],
                "duration_str": format_timestamp(video["duration"]),
                "owner_email": video.get("owner_email", ""),
                "overall_summary": video.get("overall_summary", ""),
                "raw_transcript": video.get("raw_transcript", "")
            },
            "chapters": chapters
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch video: {e}")


@app.get("/api/search")
def search_video(video_id: str = Query(...), query: str = Query(...), owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        video = db.get_video(video_id, owner_email, role)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
            
        results = db.search_blocks(video_id, query)
        all_blocks = db.get_video_blocks(video_id)
        block_id_to_idx = {b["id"]: idx for idx, b in enumerate(all_blocks, start=1)}
        
        formatted_results = []
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
        return formatted_results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


class DeleteRequest(BaseModel):
    video_id: str
    
@app.post("/api/delete")
def delete_video_endpoint(payload: DeleteRequest, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: regular users are not allowed to delete files")
        
    db.init_db()
    try:
        print(f"[Server API] Deleting video ID: {payload.video_id} ...")
        if db.delete_video(payload.video_id, owner_email, role):
            return {"success": True, "message": f"Successfully deleted video '{payload.video_id}'."}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete video from database")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {e}")


from fastapi.concurrency import run_in_threadpool

@app.post("/api/upload")
async def upload_endpoint(
    request: Request,
    filename: str = Query(...),
    owner_email: str = Query(...),
    role: str = Query("user")
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: regular users are not allowed to upload files")
        
    safe_filename = os.path.basename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
        
    try:
        from src.s3 import upload_file_stream_to_s3
        
        content_type, _ = mimetypes.guess_type(safe_filename)
        if not content_type:
            content_type = "video/mp4"
            
        s3_key = f"videos/{owner_email}/{safe_filename}"
        s3_bucket = os.getenv("AWS_S3_BUCKET")
        if not s3_bucket:
            raise HTTPException(status_code=500, detail="S3 bucket configuration is missing on server")
            
        print(f"[Server API] Uploading file '{safe_filename}' to S3 Key '{s3_key}'...")
        
        loop = asyncio.get_running_loop()
        reader = AsyncStreamReader(request, loop)
        
        success = await run_in_threadpool(upload_file_stream_to_s3, reader, s3_key, content_type)
        if not success:
            raise HTTPException(status_code=500, detail="Upload failed or was interrupted")
            
        print(f"[Server API] S3 Upload completed. Key: {s3_key}")
        return {
            "success": True,
            "s3_key": s3_key,
            "s3_bucket": s3_bucket,
            "file_name": safe_filename,
            "owner_email": owner_email,
            "message": "File uploaded to AWS S3 successfully."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


class IndexRequest(BaseModel):
    s3_key: Optional[str] = ""
    s3_bucket: Optional[str] = ""
    grid_fs_id: Optional[str] = ""
    video_path: Optional[str] = ""
    file_name: Optional[str] = ""
    language: Optional[str] = "en"
    playlist_id: Optional[str] = None
    
@app.post("/api/index")
async def index_endpoint(payload: IndexRequest, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: regular users are not allowed to index files")
        
    db.init_db()
    s3_key = payload.s3_key.strip() if payload.s3_key else ""
    s3_bucket = payload.s3_bucket.strip() if payload.s3_bucket else ""
    grid_fs_id = payload.grid_fs_id.strip() if payload.grid_fs_id else ""
    video_path = payload.video_path.strip() if payload.video_path else ""
    file_name = payload.file_name.strip() if payload.file_name else ""
    language = payload.language.strip() if (payload.language and payload.language.strip()) else "en"
    playlist_id = payload.playlist_id.strip() if (payload.playlist_id and payload.playlist_id.strip()) else None
    owner_email = owner_email.strip()
    
    import hashlib
    from src.indexer import generate_video_id
    
    # 1. Determine lookup path
    if grid_fs_id:
        lookup_path = file_name or "video.mp4"
    elif s3_key:
        lookup_path = s3_key
    else:
        resolved_path = resolve_local_file_path(video_path)
        if not resolved_path:
            raise HTTPException(status_code=404, detail=f"Local video file not found at path: {video_path}")
        lookup_path = resolved_path
        
    # 2. Check duplicate
    existing_video = db.get_video_by_path(lookup_path, owner_email)
    if existing_video:
        video_id = existing_video["id"]
        # If it's already indexed, return indexed
        if existing_video.get("upload_status") == "indexed":
            return {
                "success": True,
                "video_id": video_id,
                "status": "indexed",
                "message": "Video is already indexed."
            }
    else:
        if grid_fs_id:
            fingerprint = f"{owner_email.strip().lower()}_gridfs_{grid_fs_id}"
            video_id = hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]
        elif s3_key:
            fingerprint = f"{owner_email.strip().lower()}_s3_{s3_key}"
            video_id = hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]
        else:
            video_id = generate_video_id(lookup_path, owner_email=owner_email)
            
    final_file_name = file_name or os.path.basename(lookup_path)
    
    # Create a placeholder in the database
    db.insert_video(
        video_id=video_id,
        file_path=lookup_path,
        file_name=final_file_name,
        duration=0.0,
        owner_email=owner_email,
        upload_status="queued",
        grid_fs_id=grid_fs_id or None,
        s3_key=s3_key or None,
        s3_bucket=s3_bucket or None,
        playlist_id=playlist_id
    )
    
    # Enqueue background task
    task_payload = {
        "s3_key": s3_key,
        "s3_bucket": s3_bucket,
        "grid_fs_id": grid_fs_id,
        "video_path": video_path,
        "language": language,
        "playlist_id": playlist_id
    }
    indexing_queue.put((video_id, task_payload, owner_email))
    
    return {
        "success": True,
        "video_id": video_id,
        "status": "queued",
        "message": "Successfully queued video for indexing."
    }


class AnalyseRequest(BaseModel):
    video_id: str
    
@app.post("/api/analyse")
async def analyse_endpoint(payload: AnalyseRequest, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        print(f"[Server API] Running Gemini analysis for video ID: {payload.video_id} ...")
        video = db.get_video(payload.video_id, owner_email, role)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        actual_owner = video.get("owner_email") or owner_email
        analysed_path = await run_in_threadpool(analyse_video, payload.video_id, owner_email=actual_owner)
        return {
            "success": True,
            "analysed_path": analysed_path,
            "message": "Gemini topic boundaries analysis completed successfully."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


class SummarizeRequest(BaseModel):
    chapter_id: str
    
@app.post("/api/summarize")
async def summarize_endpoint(payload: SummarizeRequest, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    chapter_id = payload.chapter_id.strip()
    owner_email = owner_email.strip()
    
    def do_summarization():
        block = None
        if "-" in chapter_id:
            parts = chapter_id.rsplit("-", 1)
            if len(parts) == 2:
                v_id, idx_str = parts
                chapter_index = int(idx_str)
                if not db.get_video(v_id, owner_email, role):
                    raise HTTPException(status_code=404, detail=f"Chapter with ID '{chapter_id}' not found")
                blocks = db.get_video_blocks(v_id)
                if blocks and 1 <= chapter_index <= len(blocks):
                    block = blocks[chapter_index - 1]
        else:
            try:
                block = db.get_semantic_block(chapter_id)
            except ValueError:
                block = None
                
        if not block:
            raise HTTPException(status_code=404, detail=f"Chapter with ID '{chapter_id}' not found")
            
        video_id = block["video_id"]
        if not db.get_video(video_id, owner_email, role):
            raise HTTPException(status_code=404, detail=f"Chapter with ID '{chapter_id}' not found")
            
        all_blocks = db.get_video_blocks(video_id)
        block_index = 1
        for idx, b in enumerate(all_blocks, start=1):
            if b['id'] == block['id']:
                block_index = idx
                break
        resolved_chapter_id = f"{video_id}-{block_index}"
        
        cached = db.get_summary(video_id, block['id'])
        if cached:
            return {
                "summary": cached["summary_text"],
                "chapter_id": resolved_chapter_id,
                "cached": True
            }
            
        transcript_text = block["text"].strip()
        if not transcript_text:
            raise HTTPException(status_code=400, detail="Chapter has no transcript text")
            
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        from src.indexer import GEMINI_AVAILABLE
        if not GEMINI_AVAILABLE or not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
            return {
                "summary": f"**[Gemini API not configured]**\n\nRaw Transcript:\n{transcript_text}",
                "chapter_id": resolved_chapter_id,
                "cached": False
            }
            
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        system_instruction = (
            "You are a professional video content summarizer. "
            "Your task is to write a highly minimized, concise, and clear summary of the provided chapter transcript. "
            "Focus only on the most critical takeaways and core details, keeping it very short and effective."
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
                
        summary_text = response.text.strip()
        bullet_points = []
        for line in summary_text.splitlines():
            line_clean = line.strip()
            if line_clean.startswith(("-", "*", "•")):
                bullet_points.append(line_clean.lstrip("-*• ").strip())
                
        db.insert_summary(
            video_id=video_id,
            index_id=block['id'],
            raw_text_chunk=transcript_text,
            summary_text=summary_text,
            bullet_points=bullet_points
        )
        return {
            "summary": summary_text,
            "chapter_id": resolved_chapter_id,
            "cached": False
        }
        
    try:
        res = await run_in_threadpool(do_summarization)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {e}")


class OverallSummaryRequest(BaseModel):
    video_id: str
    
@app.post("/api/overall-summary")
async def overall_summary_endpoint(payload: OverallSummaryRequest, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        print(f"[Server API] Generating overall summary for video ID: {payload.video_id} ...")
        video = db.get_video(payload.video_id, owner_email, role)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        actual_owner = video.get("owner_email") or owner_email
        overall_summary = await run_in_threadpool(generate_overall_summary, payload.video_id, owner_email=actual_owner)
        return {
            "success": True,
            "overall_summary": overall_summary,
            "cached": False
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Overall summary generation failed: {e}")


@app.get("/api/stream-local-video")
def stream_video(
    request: Request,
    video_id: str = Query(""),
    path: str = Query(""),
    owner_email: str = Query(""),
    role: str = Query("user")
):
    catalog = None
    if video_id:
        catalog = db.get_video(video_id, owner_email, role)
        if not catalog:
            raise HTTPException(status_code=404, detail=f"Video catalog not found for ID: {video_id}")
            
    # S3 Storage Proxy
    if catalog and catalog.get("s3_key"):
        try:
            from src.s3 import get_s3_client
            s3_client = get_s3_client()
            bucket = catalog.get("s3_bucket") or os.getenv("AWS_S3_BUCKET")
            key = catalog.get("s3_key")
            
            head_resp = s3_client.head_object(Bucket=bucket, Key=key)
            file_size = head_resp['ContentLength']
            content_type = head_resp.get('ContentType', 'video/mp4')
            
            range_header = request.headers.get("range")
            
            if range_header and range_header.startswith("bytes="):
                range_val = range_header.split("=")[1].strip()
                parts = range_val.split("-")
                start_str = parts[0].strip()
                end_str = parts[1].strip() if len(parts) > 1 else ""
                
                if not start_str and not end_str:
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                    
                start = int(start_str) if start_str else file_size - int(end_str)
                end = int(end_str) if end_str else file_size - 1
                
                if start < 0 or start >= file_size or end < start:
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                    
                if end >= file_size:
                    end = file_size - 1
                    
                chunk_length = end - start + 1
                s3_range = f"bytes={start}-{end}"
                get_resp = s3_client.get_object(Bucket=bucket, Key=key, Range=s3_range)
                
                body_stream = get_resp['Body']
                
                def s3_chunk_generator():
                    chunk_size = 64 * 1024
                    bytes_sent = 0
                    try:
                        while bytes_sent < chunk_length:
                            read_amt = min(chunk_size, chunk_length - bytes_sent)
                            chunk = body_stream.read(read_amt)
                            if not chunk:
                                break
                            yield chunk
                            bytes_sent += len(chunk)
                    finally:
                        body_stream.close()
                        
                headers = {
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(chunk_length),
                    "Accept-Ranges": "bytes"
                }
                return StreamingResponse(s3_chunk_generator(), status_code=206, media_type=content_type, headers=headers)
            else:
                get_resp = s3_client.get_object(Bucket=bucket, Key=key)
                body_stream = get_resp['Body']
                
                def s3_full_generator():
                    chunk_size = 64 * 1024
                    try:
                        while True:
                            chunk = body_stream.read(chunk_size)
                            if not chunk:
                                break
                            yield chunk
                    finally:
                        body_stream.close()
                        
                headers = {
                    "Content-Length": str(file_size),
                    "Accept-Ranges": "bytes"
                }
                return StreamingResponse(s3_full_generator(), status_code=200, media_type=content_type, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to stream from S3: {e}")
            
    # GridFS Storage Proxy
    if catalog and catalog.get("grid_fs_id"):
        try:
            import gridfs
            from bson.objectid import ObjectId
            from src.database import get_db
            
            db_mongo = get_db()
            fs = gridfs.GridFS(db_mongo)
            grid_out = fs.get(ObjectId(catalog["grid_fs_id"]))
            
            file_size = grid_out.length
            content_type = grid_out._file.get("contentType") or grid_out._file.get("content_type") or "video/mp4"
            
            range_header = request.headers.get("range")
            if range_header and range_header.startswith("bytes="):
                range_val = range_header.split("=")[1].strip()
                parts = range_val.split("-")
                start_str = parts[0].strip()
                end_str = parts[1].strip() if len(parts) > 1 else ""
                
                if not start_str and not end_str:
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                    
                start = int(start_str) if start_str else file_size - int(end_str)
                end = int(end_str) if end_str else file_size - 1
                
                if start < 0 or start >= file_size or end < start:
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                    
                if end >= file_size:
                    end = file_size - 1
                    
                chunk_length = end - start + 1
                
                def gridfs_chunk_generator():
                    grid_out.seek(start)
                    remaining = chunk_length
                    buffer_size = 64 * 1024
                    while remaining > 0:
                        chunk_to_read = min(buffer_size, remaining)
                        data = grid_out.read(chunk_to_read)
                        if not data:
                            break
                        yield data
                        remaining -= len(data)
                        
                headers = {
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(chunk_length),
                    "Accept-Ranges": "bytes"
                }
                return StreamingResponse(gridfs_chunk_generator(), status_code=206, media_type=content_type, headers=headers)
            else:
                def gridfs_full_generator():
                    buffer_size = 64 * 1024
                    while True:
                        data = grid_out.read(buffer_size)
                        if not data:
                            break
                        yield data
                        
                headers = {
                    "Content-Length": str(file_size),
                    "Accept-Ranges": "bytes"
                }
                return StreamingResponse(gridfs_full_generator(), status_code=200, media_type=content_type, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"GridFS file streaming failed: {e}")

    # Local Disk Fallback
    if not video_path and catalog:
        video_path = catalog.get("absolute_local_path") or catalog.get("file_path")
        
    if not video_path:
        raise HTTPException(status_code=400, detail="video_id or path parameter is required")
        
    resolved_path = resolve_local_file_path(video_path)
    if not resolved_path or not os.path.isfile(resolved_path):
        raise HTTPException(status_code=404, detail=f"Local video file not found at path: {video_path}")
        
    video_path = resolved_path
    try:
        file_size = os.path.getsize(video_path)
        content_type, _ = mimetypes.guess_type(video_path)
        if not content_type:
            content_type = "video/mp4"
            
        range_header = request.headers.get("range")
        if range_header and range_header.startswith("bytes="):
            range_val = range_header.split("=")[1].strip()
            parts = range_val.split("-")
            start_str = parts[0].strip()
            end_str = parts[1].strip() if len(parts) > 1 else ""
            
            if not start_str and not end_str:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                
            start = int(start_str) if start_str else file_size - int(end_str)
            end = int(end_str) if end_str else file_size - 1
            
            if start < 0 or start >= file_size or end < start:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
                
            if end >= file_size:
                end = file_size - 1
                
            chunk_length = end - start + 1
            
            def local_chunk_generator():
                with open(video_path, "rb") as f:
                    f.seek(start)
                    remaining = chunk_length
                    buffer_size = 64 * 1024
                    while remaining > 0:
                        chunk_to_read = min(buffer_size, remaining)
                        data = f.read(chunk_to_read)
                        if not data:
                            break
                        yield data
                        remaining -= len(data)
                        
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(chunk_length),
                "Accept-Ranges": "bytes"
            }
            return StreamingResponse(local_chunk_generator(), status_code=206, media_type=content_type, headers=headers)
        else:
            def local_full_generator():
                with open(video_path, "rb") as f:
                    buffer_size = 64 * 1024
                    while True:
                        data = f.read(buffer_size)
                        if not data:
                            break
                        yield data
                        
            headers = {
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes"
            }
            return StreamingResponse(local_full_generator(), status_code=200, media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local streaming failed: {e}")

class PlaylistCreateRequest(BaseModel):
    name: str

@app.get("/api/playlists")
def list_playlists(
    owner_email: Optional[str] = Query(None),
    role: str = Query("user"),
    all_playlists: bool = Query(False, alias="all")
):
    db.init_db()
    try:
        email = "" if all_playlists else (owner_email or "")
        return db.list_playlists(email, role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list playlists: {e}")

@app.post("/api/playlists")
def create_playlist(payload: PlaylistCreateRequest, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: only admins can create playlists")
    db.init_db()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Playlist name is required")
    try:
        return db.create_playlist(name, owner_email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create playlist: {e}")

@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: str, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: only admins can delete playlists")
    db.init_db()
    try:
        success = db.delete_playlist(playlist_id, owner_email, role)
        if not success:
            raise HTTPException(status_code=404, detail="Playlist not found or deletion failed")
        return {"success": True, "message": "Playlist and all its videos deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete playlist: {e}")

class UpdatePlaylistRequest(BaseModel):
    playlist_id: Optional[str] = None

@app.patch("/api/videos/{video_id}/playlist")
def update_video_playlist_endpoint(video_id: str, payload: UpdatePlaylistRequest, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: only admins can reorganize the catalog")
    db.init_db()
    try:
        success = db.update_video_playlist(video_id, payload.playlist_id, owner_email, role)
        if not success:
            raise HTTPException(status_code=404, detail="Video not found or update failed")
        return {"success": True, "message": "Video playlist updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update playlist: {e}")

class QuestionModel(BaseModel):
    questionText: str
    options: List[str]
    correctAnswerIdx: int
    explanation: Optional[str] = ""

class QuizCreateRequest(BaseModel):
    title: str
    catalogId: Optional[str] = None
    playlistId: Optional[str] = None
    questions: List[QuestionModel]

@app.post("/api/quizzes")
def create_quiz_endpoint(
    payload: QuizCreateRequest,
    owner_email: str = Query(...),
    role: str = Query("user")
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only admin can create or edit quizzes.")

    if not payload.catalogId and not payload.playlistId:
        raise HTTPException(status_code=400, detail="Either catalogId or playlistId must be provided.")

    try:
        questions_dict = [q.model_dump() for q in payload.questions]
        quiz_id = db.save_quiz(
            title=payload.title,
            created_by=owner_email,
            catalog_id=payload.catalogId,
            playlist_id=payload.playlistId,
            questions=questions_dict
        )
        return {"success": True, "quiz_id": quiz_id, "message": "Quiz saved successfully."}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save quiz: {e}")

@app.post("/api/quizzes/upload")
async def upload_quiz_endpoint(
    file: UploadFile = File(...),
    catalog_id: Optional[str] = Query(None),
    playlist_id: Optional[str] = Query(None),
    owner_email: str = Query(...),
    role: str = Query("user")
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only admin can upload quiz documents.")

    if not catalog_id and not playlist_id:
        raise HTTPException(status_code=400, detail="Either catalog_id or playlist_id must be provided.")

    db.init_db()

    try:
        file_bytes = await file.read()
        filename = file.filename or "quiz.txt"
        content_type = file.content_type or "text/plain"
        
        # Check structured formats first
        if filename.endswith(".json"):
            try:
                content_str = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content_str = file_bytes.decode("latin-1")
            from src.quiz_parser import parse_json
            parsed_quiz = parse_json(content_str)
        elif filename.endswith(".csv"):
            try:
                content_str = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content_str = file_bytes.decode("latin-1")
            from src.quiz_parser import parse_csv
            parsed_quiz = parse_csv(content_str)
        else:
            api_key = os.getenv("GEMINI_API_KEY", "").strip()
            from src.indexer import GEMINI_AVAILABLE
            if not GEMINI_AVAILABLE or not api_key or api_key == '""' or "your_gemini_api_key_here" in api_key:
                raise HTTPException(
                    status_code=400,
                    detail="Gemini API is not configured. Cannot parse unstructured documents."
                )
            
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
            from src.quiz_parser import parse_unstructured_with_gemini
            parsed_quiz = await parse_unstructured_with_gemini(
                file_bytes=file_bytes,
                filename=filename,
                mime_type=content_type,
                api_key=api_key,
                model_name=model_name
            )

        if not parsed_quiz or "questions" not in parsed_quiz or not parsed_quiz["questions"]:
            raise ValueError("No questions could be extracted from the uploaded document.")

        quiz_id = db.save_quiz(
            title=parsed_quiz.get("title", "Uploaded Quiz"),
            created_by=owner_email,
            catalog_id=catalog_id,
            playlist_id=playlist_id,
            questions=parsed_quiz["questions"]
        )

        return {
            "success": True,
            "quiz_id": quiz_id,
            "title": parsed_quiz.get("title", "Uploaded Quiz"),
            "questions": parsed_quiz["questions"],
            "message": "Quiz parsed and saved successfully."
        }

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process quiz document: {e}")

@app.get("/api/quizzes")
def get_quiz_endpoint(
    video_id: Optional[str] = Query(None),
    playlist_id: Optional[str] = Query(None)
):
    if not video_id and not playlist_id:
        raise HTTPException(status_code=400, detail="Either video_id or playlist_id must be provided.")

    try:
        quiz = db.get_quiz_by_target(catalog_id=video_id, playlist_id=playlist_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found for the specified video or playlist.")
        return quiz
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quiz: {e}")

@app.delete("/api/quizzes")
def delete_quiz_endpoint(
    video_id: Optional[str] = Query(None),
    playlist_id: Optional[str] = Query(None),
    owner_email: str = Query(...),
    role: str = Query("user")
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only admin can delete quizzes.")
    if not video_id and not playlist_id:
        raise HTTPException(status_code=400, detail="Either video_id or playlist_id must be provided.")
    try:
        quiz = db.get_quiz_by_target(catalog_id=video_id, playlist_id=playlist_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        db.delete_quiz(quiz["_id"])
        return {"success": True, "message": "Quiz deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete quiz: {e}")

class AnswerSubmission(BaseModel):
    questionIdx: int
    selectedOptionIdx: int

class QuizSubmitRequest(BaseModel):
    quizId: str
    answers: List[AnswerSubmission]

@app.post("/api/quizzes/submit")
def submit_quiz_endpoint(
    payload: QuizSubmitRequest,
    owner_email: Optional[str] = Query(None),
    role: Optional[str] = Query(None)
):
    from bson.objectid import ObjectId
    from bson.errors import InvalidId
    db_conn = db.get_db()
    try:
        try:
            oid = ObjectId(payload.quizId)
            quiz = db_conn.quizzes.find_one({"_id": oid})
        except InvalidId:
            quiz = db_conn.quizzes.find_one({"_id": payload.quizId})

        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions = quiz.get("questions", [])
        total_questions = len(questions)
        if total_questions == 0:
            return {
                "score": 0.0,
                "correctCount": 0,
                "totalCount": 0,
                "results": []
            }

        user_answers = {ans.questionIdx: ans.selectedOptionIdx for ans in payload.answers}
        correct_count = 0
        results = []

        for idx, q in enumerate(questions):
            selected = user_answers.get(idx, -1)
            correct_idx = q.get("correctAnswerIdx")
            is_correct = (selected == correct_idx)
            if is_correct:
                correct_count += 1

            results.append({
                "questionIdx": idx,
                "questionText": q.get("questionText"),
                "options": q.get("options", []),
                "selectedOptionIdx": selected,
                "correctAnswerIdx": correct_idx,
                "isCorrect": is_correct,
                "explanation": q.get("explanation", "")
            })

        score_percentage = round((correct_count / total_questions) * 100, 2)

        # Resolve username
        username = "Anonymous"
        if owner_email:
            user_doc = db_conn.users.find_one({"email": owner_email.strip().lower()})
            if user_doc:
                username = user_doc.get("username", owner_email.split('@')[0])
            else:
                username = owner_email.split('@')[0]

        # Resolve playlist_id from catalog if missing on quiz
        playlist_id = quiz.get("playlistId")
        if not playlist_id and quiz.get("catalogId"):
            cat_doc = db_conn.catalogs.find_one({"_id": quiz.get("catalogId")})
            if cat_doc:
                playlist_id = cat_doc.get("playlistId")

        # Persist the attempt in DB
        db.save_quiz_attempt(
            quiz_id=str(quiz["_id"]),
            quiz_title=quiz.get("title", "Untitled Quiz"),
            catalog_id=str(quiz.get("catalogId")) if quiz.get("catalogId") else None,
            playlist_id=str(playlist_id) if playlist_id else None,
            user_email=owner_email or "anonymous",
            username=username,
            score=score_percentage,
            correct_count=correct_count,
            total_count=total_questions,
            results=results
        )

        return {
            "score": score_percentage,
            "correctCount": correct_count,
            "totalCount": total_questions,
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit quiz: {e}")


@app.get("/api/quizzes/analytics")
def get_quiz_analytics_endpoint(
    owner_email: str = Query(...),
    role: str = Query("user")
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only admin can view quiz analytics.")
    
    try:
        from bson.objectid import ObjectId
        db_conn = db.get_db()
        
        clean_email = owner_email.strip().lower()
        
        # Load courses (playlists) owned by this admin
        playlists = list(db_conn.playlists.find({"ownerEmail": clean_email}))
        playlist_map = {str(p["_id"]): p.get("name", "Untitled Course") for p in playlists}
        playlist_ids = set(playlist_map.keys())
        
        # Load catalog (videos) owned by this admin to resolve playlist mapping
        catalogs = list(db_conn.catalogs.find({"ownerEmail": clean_email}))
        catalog_to_playlist = {str(c["_id"]): str(c["playlistId"]) if c.get("playlistId") else None for c in catalogs}
        catalog_ids = set(catalog_to_playlist.keys())
        
        # Load quizzes associated with this admin (created by them, or linked to their playlist/catalog)
        quizzes_query = {
            "$or": [
                {"createdBy": clean_email}
            ]
        }
        if playlist_ids:
            quizzes_query["$or"].append({"playlistId": {"$in": [ObjectId(pid) for pid in playlist_ids]}})
        if catalog_ids:
            quizzes_query["$or"].append({"catalogId": {"$in": [ObjectId(cid) for cid in catalog_ids]}})
            
        quizzes = list(db_conn.quizzes.find(quizzes_query))
        quiz_id_to_course = {}
        quiz_id_to_title = {}
        for q in quizzes:
            q_id = str(q["_id"])
            p_id = str(q["playlistId"]) if q.get("playlistId") else None
            if not p_id and q.get("catalogId"):
                p_id = catalog_to_playlist.get(str(q["catalogId"]))
            quiz_id_to_course[q_id] = p_id
            quiz_id_to_title[q_id] = q.get("title", "Untitled Quiz")

        # Load and filter attempts to only those for this admin's content
        all_attempts = db.get_quiz_attempts()
        attempts = []
        for a in all_attempts:
            q_id = a["quizId"]
            p_id = a.get("playlistId")
            if not p_id and a.get("catalogId"):
                p_id = catalog_to_playlist.get(a.get("catalogId"))
            
            # Scoping: playlist is owned by admin, or catalog is owned by admin, or quiz is owned by admin
            is_owned_playlist = p_id in playlist_ids
            is_owned_catalog = a.get("catalogId") in catalog_ids
            is_owned_quiz = q_id in quiz_id_to_course
            
            if is_owned_playlist or is_owned_catalog or is_owned_quiz:
                a["playlistId"] = p_id
                a["courseName"] = playlist_map.get(p_id, "Individual Videos")
                attempts.append(a)

                # Fallback mappings for title and course if quiz is deleted/unlisted
                if q_id not in quiz_id_to_course:
                    quiz_id_to_course[q_id] = p_id
                if q_id not in quiz_id_to_title:
                    quiz_id_to_title[q_id] = a.get("quizTitle", "Untitled Quiz")

        total_attempts = len(attempts)
        
        if total_attempts > 0:
            average_score = round(sum(a["score"] for a in attempts) / total_attempts, 2)
            passing_attempts = sum(1 for a in attempts if a["score"] >= 75.0)
            pass_rate = round((passing_attempts / total_attempts) * 100, 2)
        else:
            average_score = 0.0
            pass_rate = 0.0

        # Group attempts by quiz
        quiz_attempts_map = {}
        for a in attempts:
            q_id = a["quizId"]
            if q_id not in quiz_attempts_map:
                quiz_attempts_map[q_id] = []
            quiz_attempts_map[q_id].append(a)

        # Build course structures
        course_groups = {}
        for p_id, p_name in playlist_map.items():
            course_groups[p_id] = {
                "id": p_id,
                "name": p_name,
                "quizzes": []
            }
        course_groups["individual"] = {
            "id": "individual",
            "name": "Individual Videos",
            "quizzes": []
        }

        for q_id, p_id in quiz_id_to_course.items():
            q_title = quiz_id_to_title.get(q_id, "Untitled Quiz")
            q_attempts = quiz_attempts_map.get(q_id, [])
            
            attempts_count = len(q_attempts)
            if attempts_count > 0:
                avg_score = round(sum(a["score"] for a in q_attempts) / attempts_count, 2)
            else:
                avg_score = 0.0
                
            quiz_data = {
                "quizId": q_id,
                "quizTitle": q_title,
                "attemptsCount": attempts_count,
                "averageScore": avg_score,
                "attempts": q_attempts
            }
            
            target_p_id = p_id if p_id in course_groups else "individual"
            course_groups[target_p_id]["quizzes"].append(quiz_data)

        # Combine into courses_list
        courses_list = []
        for p_id in playlist_map.keys():
            if p_id in course_groups and len(course_groups[p_id]["quizzes"]) > 0:
                courses_list.append(course_groups[p_id])
                
        if "individual" in course_groups and len(course_groups["individual"]["quizzes"]) > 0:
            courses_list.append(course_groups["individual"])

        return {
            "attempts": attempts,
            "courses": courses_list,
            "stats": {
                "totalAttempts": total_attempts,
                "averageScore": average_score,
                "passRate": pass_rate
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quiz analytics: {e}")



if __name__ == "__main__":
    import uvicorn
    print(f"[Server] Starting FastAPI + Uvicorn server on port {PORT}...")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
