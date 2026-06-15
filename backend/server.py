import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import json
import urllib.parse
import mimetypes
import sys
import asyncio
import io
from fastapi import FastAPI, Request, Query, HTTPException, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

# Define FRONTEND_DIR pointing to the Vite build directory
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

# Add current workspace to path to import src modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import src.database as db
from src.indexer import index_video, analyse_video
from main import format_timestamp

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
        "Your task is to write a cohesive, comprehensive overall summary "
        "of the entire video based on the provided chapter transcripts. "
        "Do NOT write it section-wise, chapter-wise, or with section headers/numbers. "
        "Instead, synthesize all details into a single unified summary of the entire video, "
        "while retaining all the key points and core takeaways in that summary."
    )
    prompt = (
        f"Please generate a unified overall summary (not broken down by chapter or section) "
        f"for the following video, capturing all key points and takeaways in a cohesive narrative:\n\n"
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

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register")
def register_endpoint(payload: RegisterRequest):
    db.init_db()
    email = payload.email.strip()
    password = payload.password
    role = payload.role.strip().lower()
    
    if not email or not password or not role:
        raise HTTPException(status_code=400, detail="Email, password, and role are required")
        
    if role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    user = db.create_user(email, password, role)
    if not user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
        
    return {
        "success": True,
        "email": user["email"],
        "role": user["role"],
        "message": "User registered successfully"
    }

@app.post("/api/auth/login")
def login_endpoint(payload: LoginRequest):
    db.init_db()
    email = payload.email.strip()
    password = payload.password
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    user = db.authenticate_user(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    return {
        "success": True,
        "email": user["email"],
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
def list_videos(owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        email_filter = "" if role == "admin" else owner_email
        videos = db.list_videos(email_filter)
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
        return video_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list videos: {e}")


@app.get("/api/videos/{video_id}")
def get_video(video_id: str, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        email_filter = "" if role == "admin" else owner_email
        video = db.get_video(video_id, email_filter)
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
                "absolute_local_path": video.get("absolute_local_path", ""),
                "timeline_index": video.get("timeline_index", []),
                "duration": video["duration"],
                "duration_str": format_timestamp(video["duration"]),
                "overall_summary": video.get("overall_summary", "")
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
        email_filter = "" if role == "admin" else owner_email
        video = db.get_video(video_id, email_filter)
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
        email_filter = "" if role == "admin" else owner_email
        if db.delete_video(payload.video_id, email_filter):
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
    language: Optional[str] = None
    
@app.post("/api/index")
async def index_endpoint(payload: IndexRequest, owner_email: str = Query(...), role: str = Query("user")):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: regular users are not allowed to index files")
        
    db.init_db()
    s3_key = payload.s3_key.strip() if payload.s3_key else ""
    s3_bucket = payload.s3_bucket.strip() if payload.s3_bucket else ""
    grid_fs_id = payload.grid_fs_id.strip() if payload.grid_fs_id else ""
    video_path = payload.video_path.strip() if payload.video_path else ""
    language = payload.language.strip() if (payload.language and payload.language.strip()) else None
    owner_email = owner_email.strip()
    
    def run_pipeline():
        # Option A: AWS S3
        if s3_key:
            from src.s3 import get_s3_client
            from src.config import get_temp_dir
            import uuid
            
            s3_client = get_s3_client()
            bucket = s3_bucket if s3_bucket else os.getenv("AWS_S3_BUCKET")
            if not bucket:
                raise HTTPException(status_code=500, detail="S3 bucket configuration is missing")
                
            temp_dir = get_temp_dir()
            safe_filename = os.path.basename(s3_key)
            unique_id = str(uuid.uuid4())[:8]
            temp_video_path = os.path.join(temp_dir, f"temp_{unique_id}_{safe_filename}")
            
            print(f"[Server API] Buffering S3 file '{s3_key}' to temp path: {temp_video_path} ...")
            try:
                s3_client.download_file(bucket, s3_key, temp_video_path)
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"S3 file not found or download failed: {e}")
                
            try:
                print(f"[Server API] Indexing S3 video: {s3_key} ...")
                video_id, blocks = index_video(
                    temp_video_path,
                    language=language,
                    owner_email=owner_email,
                    original_filename=safe_filename,
                    s3_key=s3_key,
                    s3_bucket=bucket
                )
            finally:
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                    print(f"[Server API] Cleaned up temporary video file: {temp_video_path}")
                    
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
                raise HTTPException(status_code=404, detail=f"GridFS file not found: {e}")
                
            temp_dir = get_temp_dir()
            safe_filename = os.path.basename(grid_out.filename)
            temp_video_path = os.path.join(temp_dir, f"temp_{grid_fs_id}_{safe_filename}")
            
            print(f"[Server API] Buffering GridFS file to temp path: {temp_video_path} ...")
            with open(temp_video_path, 'wb') as temp_file:
                temp_file.write(grid_out.read())
                
            try:
                print(f"[Server API] Indexing GridFS video: {grid_out.filename} ...")
                video_id, blocks = index_video(
                    temp_video_path,
                    language=language,
                    owner_email=owner_email,
                    grid_fs_id=grid_fs_id,
                    original_filename=grid_out.filename
                )
            finally:
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                    print(f"[Server API] Cleaned up temporary video file: {temp_video_path}")
                    
        # Option C: Local path
        else:
            if not video_path:
                raise HTTPException(status_code=400, detail="video_path, s3_key, or grid_fs_id is required")
                
            resolved_path = resolve_local_file_path(video_path)
            if not resolved_path:
                raise HTTPException(status_code=404, detail=f"Local video file not found at path: {video_path}")
                
            print(f"[Server API] Indexing video: {resolved_path} ...")
            video_id, blocks = index_video(resolved_path, language=language, owner_email=owner_email)
            
        # Common post-index steps
        try:
            print(f"[Server API] Automatically analyzing video ID: {video_id} ...")
            analyse_video(video_id, owner_email=owner_email)
        except Exception as ex:
            print(f"[Server API Warning] Automatic boundary analysis failed: {ex}")
            
        try:
            print(f"[Server API] Automatically generating overall summary for video ID: {video_id} ...")
            generate_overall_summary(video_id, owner_email=owner_email)
        except Exception as ex:
            print(f"[Server API Warning] Automatic overall summary generation failed: {ex}")
            
        return video_id
        
    try:
        video_id = await run_in_threadpool(run_pipeline)
        return {
            "success": True,
            "video_id": video_id,
            "message": "Successfully indexed video, ran semantic boundary analysis, and generated overall summary."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to complete indexing pipeline: {e}")


class AnalyseRequest(BaseModel):
    video_id: str
    
@app.post("/api/analyse")
async def analyse_endpoint(payload: AnalyseRequest, owner_email: str = Query(...), role: str = Query("user")):
    db.init_db()
    try:
        print(f"[Server API] Running Gemini analysis for video ID: {payload.video_id} ...")
        email_filter = "" if role == "admin" else owner_email
        video = db.get_video(payload.video_id, email_filter)
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
    email_filter = "" if role == "admin" else owner_email
    
    def do_summarization():
        block = None
        if "-" in chapter_id:
            parts = chapter_id.rsplit("-", 1)
            if len(parts) == 2:
                v_id, idx_str = parts
                chapter_index = int(idx_str)
                if not db.get_video(v_id, email_filter):
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
        if not db.get_video(video_id, email_filter):
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
        email_filter = "" if role == "admin" else owner_email
        video = db.get_video(payload.video_id, email_filter)
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
        email_filter = "" if role == "admin" else owner_email
        catalog = db.get_video(video_id, email_filter)
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


if __name__ == "__main__":
    import uvicorn
    print(f"[Server] Starting FastAPI + Uvicorn server on port {PORT}...")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
