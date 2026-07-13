import os
import urllib.parse
import hashlib
import secrets
from typing import List, Dict, Any, Optional
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
class VideoCancelledException(Exception):
    """Custom exception raised when video processing is cancelled/deleted."""
    pass

from src.config import get_mongodb_uri


_client = None
_db_initialized = False

def get_mongodb_client() -> MongoClient:
    """Gets or initializes the global MongoClient."""
    global _client
    if _client is None:
        uri = get_mongodb_uri()
        _client = MongoClient(uri)
    return _client

def get_db():
    """Returns the MongoDB database object based on the configured URI."""
    client = get_mongodb_client()
    uri = get_mongodb_uri()
    parsed = urllib.parse.urlparse(uri)
    db_name = parsed.path.strip('/')
    if not db_name:
        db_name = 'summarix_test'  # Default to 'summarix_test' to align database naming
    return client[db_name]

def init_db():
    """Initializes the MongoDB collections and creates indexes."""
    global _db_initialized
    if _db_initialized:
        return
    db = get_db()
    
    # 1. catalogs collection
    db.catalogs.create_index("filePath", unique=True)
    db.catalogs.create_index("ownerEmail")
    
    # 2. indices collection
    db.indices.create_index([("catalogId", 1), ("startTime", 1)])
    
    # 3. summaries collection
    db.summaries.create_index([("catalogId", 1), ("indexId", 1)], unique=True)
    
    # 4. users collection
    db.users.create_index("email", unique=True)
    
    # 5. playlists collection
    db.playlists.create_index("ownerEmail")
    
    # 6. progress collection
    db.progress.create_index([("user_email", 1), ("video_id", 1)], unique=True)
    
    print("[DB] MongoDB collections and indexes initialized successfully. Status Code: 200")
    _db_initialized = True

def _map_catalog_to_sqlite_style(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert MongoDB Catalog document back to SQLite schema keys for compatibility."""
    if not doc:
        return {}
    
    # Process timelineIndex array to match serialization expectations if needed
    raw_timeline = doc.get("timelineIndex", [])
    timeline_index = []
    if isinstance(raw_timeline, list):
        for item in raw_timeline:
            if isinstance(item, dict):
                timeline_index.append({
                    "timestamp": item.get("timestamp", ""),
                    "title": item.get("title", ""),
                    "seconds": item.get("seconds", 0)
                })
            
    created_at_val = doc.get("createdAt")
    if isinstance(created_at_val, datetime):
        created_at_str = created_at_val.isoformat()
    else:
        created_at_str = str(created_at_val) if created_at_val else ""

    return {
        "id": str(doc["_id"]),
        "file_name": doc.get("fileName", ""),
        "file_type": doc.get("fileType", ""),
        "file_path": doc.get("filePath", ""),
        "playlist_id": str(doc["playlistId"]) if doc.get("playlistId") else None,
        "duration": doc.get("duration", 0.0),
        "upload_status": doc.get("uploadStatus", "pending"),
        "raw_transcript": doc.get("rawTranscript", ""),
        "overall_summary": doc.get("overallSummary", ""),
        "absolute_local_path": doc.get("absoluteLocalPath", ""),
        "grid_fs_id": str(doc["gridFsFileId"]) if doc.get("gridFsFileId") else None,
        "s3_key": doc.get("s3Key", ""),
        "s3_bucket": doc.get("s3Bucket", ""),
        "owner_email": doc.get("ownerEmail", ""),
        "timeline_index": timeline_index,
        "order": doc.get("order", 0),
        "created_at": created_at_str
    }

def _map_index_to_sqlite_style(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert MongoDB Index document back to SQLite schema keys for compatibility."""
    if not doc:
        return {}
    return {
        "id": str(doc["_id"]),
        "video_id": str(doc.get("catalogId", "")),
        "start_time": doc.get("startTime", 0.0),
        "end_time": doc.get("endTime", 0.0),
        "topic_title": doc.get("topicTitle", "Section"),
        "text": doc.get("text", ""),
        "status": doc.get("status", "raw")
    }

def insert_video(video_id: str, file_path: str, file_name: str, duration: float, owner_email: str = "", upload_status: str = "indexed", raw_transcript: str = "", overall_summary: str = "", absolute_local_path: str = None, grid_fs_id: str = None, s3_key: str = None, s3_bucket: str = None, playlist_id: str = None) -> bool:
    """Inserts or replaces a video (catalog) document."""
    db = get_db()
    try:
        try:
            oid = ObjectId(video_id)
        except InvalidId:
            oid = video_id
            
        ext = os.path.splitext(file_name)[1].lower().strip('.')
        file_type = "video" if ext in ("mp4", "mkv", "mov") else ("audio" if ext in ("mp3", "wav", "m4a") else "video")
        
        email = owner_email.strip().lower() if owner_email else "anonymous@summarix.io"
        
        existing = db.catalogs.find_one({"_id": oid})
        
        if grid_fs_id:
            grid_fs_oid = ObjectId(grid_fs_id)
            absolute_local_path = "" # Do not store local path if stored in database
        else:
            grid_fs_oid = None
            
        if s3_key:
            absolute_local_path = "" # Do not store local path if stored in S3
            
        if not grid_fs_id and not s3_key:
            if absolute_local_path is None:
                absolute_local_path = file_path
            
        if playlist_id:
            try:
                playlist_oid = ObjectId(playlist_id)
            except InvalidId:
                playlist_oid = playlist_id
        else:
            playlist_oid = None
            
        update_fields = {
            "fileName": file_name,
            "fileType": file_type,
            "filePath": file_path,
            "playlistId": playlist_oid,
            "absoluteLocalPath": absolute_local_path,
            "gridFsFileId": grid_fs_oid,
            "s3Key": s3_key or "",
            "s3Bucket": s3_bucket or "",
            "duration": duration,
            "ownerEmail": email,
            "updatedAt": datetime.now()
        }
        
        if raw_transcript:
            update_fields["rawTranscript"] = raw_transcript
            
        if overall_summary:
            update_fields["overallSummary"] = overall_summary
            
        if upload_status:
            update_fields["uploadStatus"] = upload_status
            
        history_entry = f"Indexed video details via Python indexer at {datetime.now().isoformat()}"
        
        update_doc = {
            "$set": update_fields,
            "$setOnInsert": {
                "createdAt": datetime.now()
            }
        }
        
        if existing:
            update_doc["$push"] = {
                "history": history_entry
            }
        else:
            update_doc["$setOnInsert"]["history"] = [history_entry]
            
        db.catalogs.update_one(
            {"_id": oid},
            update_doc,
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to insert video: {e}")
        return False

def insert_semantic_blocks(video_id: str, blocks: List[Dict[str, Any]]) -> bool:
    """Inserts a batch of semantic blocks (indices) for a given video."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        # First delete existing indices for this catalog to prevent duplicates
        db.indices.delete_many({"catalogId": catalog_oid})
        
        docs = []
        timeline_index = []
        for b in blocks:
            start_time = float(b['start_time'])
            end_time = float(b['end_time'])
            
            # Format timestamp helper locally to avoid circular import with indexer.py
            h = int(start_time // 3600)
            m = int((start_time % 3600) // 60)
            s = int(start_time % 60)
            timestamp_str = f"{h:02d}:{m:02d}:{s:02d}" if h > 0 else f"{m:02d}:{s:02d}"
            
            topic = b.get('topic_title', 'Section')
            
            docs.append({
                "catalogId": catalog_oid,
                "startTime": start_time,
                "endTime": end_time,
                "topicTitle": topic,
                "text": b['text'],
                "status": b.get('status', 'raw'),
                "createdAt": datetime.now(),
                "updatedAt": datetime.now()
            })
            
            timeline_index.append({
                "timestamp": timestamp_str,
                "title": topic,
                "seconds": int(start_time)
            })
            
        if docs:
            db.indices.insert_many(docs)
            
        # Update Catalog's timelineIndex subdocument array
        db.catalogs.update_one(
            {"_id": catalog_oid},
            {"$set": {
                "timelineIndex": timeline_index,
                "updatedAt": datetime.now()
            }}
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to insert semantic blocks: {e}")
        return False

def _build_owner_filter(owner_email: str, role: str = "user") -> Dict[str, Any]:
    """Helper to construct MongoDB $or filter for user/admin scoping."""
    if not owner_email:
        return {}
    
    clean_email = owner_email.strip().lower()
    if role == "admin":
        return {"$or": [
            {"ownerEmail": clean_email},
            {"ownerEmail": ""},
            {"ownerEmail": "anonymous@summarix.io"}
        ]}
    else:
        admin_emails = get_admin_emails()
        return {"$or": [
            {"ownerEmail": clean_email},
            {"ownerEmail": ""},
            {"ownerEmail": "anonymous@summarix.io"},
            {"ownerEmail": {"$in": admin_emails}}
        ]}

def get_video(video_id: str, owner_email: str = "", role: str = "user") -> Optional[Dict[str, Any]]:
    """Retrieves metadata for a specific video."""
    db = get_db()
    try:
        try:
            oid = ObjectId(video_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": video_id}
            
        if owner_email and role != "admin":
            query.update(_build_owner_filter(owner_email, role))
        doc = db.catalogs.find_one(query)
        return _map_catalog_to_sqlite_style(doc) if doc else None
    except Exception as e:
        print(f"[DB Error] Failed to get video: {e}")
        return None

def get_video_by_path(file_path: str, owner_email: str = "", role: str = "user") -> Optional[Dict[str, Any]]:
    """Retrieves metadata for a specific video by its path."""
    db = get_db()
    try:
        query = {"filePath": file_path}
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
        doc = db.catalogs.find_one(query)
        return _map_catalog_to_sqlite_style(doc) if doc else None
    except Exception as e:
        print(f"[DB Error] Failed to get video by path: {e}")
        return None

def list_videos(owner_email: str = "", role: str = "user") -> List[Dict[str, Any]]:
    """Lists all indexed videos, ordered by creation time descending."""
    db = get_db()
    try:
        query = {}
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
        docs = db.catalogs.find(query).sort([("order", 1), ("createdAt", 1)])
        return [_map_catalog_to_sqlite_style(d) for d in docs]
    except Exception as e:
        print(f"[DB Error] Failed to list videos: {e}")
        return []

def get_video_blocks(video_id: str) -> List[Dict[str, Any]]:
    """Retrieves all semantic blocks (indices) for a given video, sorted by start time."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        docs = db.indices.find({"catalogId": catalog_oid}).sort("startTime", 1)
        return [_map_index_to_sqlite_style(d) for d in docs]
    except Exception as e:
        print(f"[DB Error] Failed to get video blocks: {e}")
        return []

def search_blocks(video_id: str, query: str) -> List[Dict[str, Any]]:
    """Searches for query in the semantic blocks of a specific video."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        docs = db.indices.find({
            "catalogId": catalog_oid,
            "text": {"$regex": query, "$options": "i"}
        }).sort("startTime", 1)
        return [_map_index_to_sqlite_style(d) for d in docs]
    except Exception as e:
        print(f"[DB Error] Failed to search blocks: {e}")
        return []

def delete_video(video_id: str, owner_email: str = "", role: str = "user") -> bool:
    """Deletes a video and cascades deletions on indices and summaries."""
    db = get_db()
    try:
        try:
            oid = ObjectId(video_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": video_id}
            
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
            
        video_doc = db.catalogs.find_one(query)
        if not video_doc:
            return False
            
        actual_oid = video_doc["_id"]
        
        # Cascade delete indices, summaries, and quizzes
        db.summaries.delete_many({"catalogId": actual_oid})
        db.indices.delete_many({"catalogId": actual_oid})
        db.quizzes.delete_many({"catalogId": actual_oid})
        
        # Drop GridFS file if it exists
        grid_fs_file_id = video_doc.get("gridFsFileId")
        if grid_fs_file_id:
            import gridfs
            fs = gridfs.GridFS(db)
            try:
                fs.delete(grid_fs_file_id)
                print(f"[DB] GridFS video file {grid_fs_file_id} deleted successfully.")
            except Exception as ge:
                print(f"[DB Warning] Failed to delete GridFS video file {grid_fs_file_id}: {ge}")

        # Delete AWS S3 file if it exists
        s3_key = video_doc.get("s3Key")
        if s3_key:
            try:
                from src.s3 import delete_s3_object
                delete_s3_object(s3_key)
            except Exception as se:
                print(f"[DB Warning] Failed to delete S3 video object {s3_key}: {se}")

        db.catalogs.delete_one({"_id": actual_oid})
        return True
    except Exception as e:
        print(f"[DB Error] Failed to delete video: {e}")
        return False

def get_semantic_block(block_id: Any) -> Optional[Dict[str, Any]]:
    """Retrieves a specific semantic block by its unique ID."""
    db = get_db()
    try:
        if isinstance(block_id, str):
            try:
                oid = ObjectId(block_id)
            except InvalidId:
                oid = block_id
        else:
            oid = block_id
            
        doc = db.indices.find_one({"_id": oid})
        return _map_index_to_sqlite_style(doc) if doc else None
    except Exception as e:
        print(f"[DB Error] Failed to get semantic block: {e}")
        return None

def get_summary(video_id: str, index_id: str) -> Optional[Dict[str, Any]]:
    """Fetches a cached summary from the summaries collection."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        try:
            index_oid = ObjectId(index_id)
        except InvalidId:
            index_oid = index_id
            
        doc = db.summaries.find_one({
            "catalogId": catalog_oid,
            "indexId": index_oid
        })
        if doc:
            return {
                "id": str(doc["_id"]),
                "catalog_id": str(doc["catalogId"]),
                "index_id": str(doc["indexId"]),
                "raw_text_chunk": doc.get("rawTextChunk", ""),
                "summary_text": doc.get("summaryText", ""),
                "bullet_points": doc.get("bulletPoints", []),
                "cached_at": doc.get("cachedAt", datetime.now()).isoformat() if isinstance(doc.get("cachedAt"), datetime) else str(doc.get("cachedAt", ""))
            }
        return None
    except Exception as e:
        print(f"[DB Error] Failed to get summary: {e}")
        return None

def insert_summary(video_id: str, index_id: str, raw_text_chunk: str, summary_text: str, bullet_points: List[str] = None) -> bool:
    """Saves a new chapter summary in the summaries collection."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        try:
            index_oid = ObjectId(index_id)
        except InvalidId:
            index_oid = index_id
            
        if bullet_points is None:
            bullet_points = []
            
        db.summaries.update_one(
            {
                "catalogId": catalog_oid,
                "indexId": index_oid
            },
            {
                "$set": {
                    "rawTextChunk": raw_text_chunk.strip(),
                    "summaryText": summary_text.strip(),
                    "bulletPoints": bullet_points,
                    "cachedAt": datetime.now(),
                    "updatedAt": datetime.now()
                },
                "$setOnInsert": {
                    "createdAt": datetime.now()
                }
            },
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to insert summary: {e}")
        return False

def update_overall_summary(video_id: str, overall_summary: str) -> bool:
    """Saves aggregated overall summary in the Catalog record."""
    db = get_db()
    try:
        try:
            catalog_oid = ObjectId(video_id)
        except InvalidId:
            catalog_oid = video_id
            
        db.catalogs.update_one(
            {"_id": catalog_oid},
            {
                "$set": {
                    "overallSummary": overall_summary.strip(),
                    "updatedAt": datetime.now()
                }
            }
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to update overall summary: {e}")
        return False


def hash_password(password: str) -> str:
    """Hashes the password securely using PBKDF2-SHA256."""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return f"{salt}:{pwd_hash}"

def verify_password(password: str, hashed_password_string: str) -> bool:
    """Verifies a password against its stored hash."""
    if not hashed_password_string or ":" not in hashed_password_string:
        return False
    salt, pwd_hash = hashed_password_string.split(":", 1)
    test_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash == test_hash

def create_user(email: str, password_raw: str, role: str, username: str = "") -> Optional[Dict[str, Any]]:
    """Creates a new user record in the database."""
    db = get_db()
    try:
        email_clean = email.strip().lower()
        role_clean = role.strip().lower()
        if role_clean not in ["admin", "user"]:
            role_clean = "user"
            
        # Check if user already exists
        if db.users.find_one({"email": email_clean}):
            return None
            
        hashed = hash_password(password_raw)
        final_username = username.strip() if username else email_clean.split('@')[0]
        user_doc = {
            "email": email_clean,
            "username": final_username,
            "passwordHash": hashed,
            "role": role_clean,
            "createdAt": datetime.now()
        }
        db.users.insert_one(user_doc)
        return {
            "email": email_clean,
            "username": final_username,
            "role": role_clean
        }
    except Exception as e:
        print(f"[DB Error] Failed to create user: {e}")
        return None

def change_user_password(email: str, old_password_raw: str, new_password_raw: str) -> bool:
    """Changes a user's password if the old password is correct."""
    db = get_db()
    try:
        email_clean = email.strip().lower()
        user = db.users.find_one({"email": email_clean})
        if not user:
            return False
            
        if not verify_password(old_password_raw, user["passwordHash"]):
            return False
            
        new_hashed = hash_password(new_password_raw)
        db.users.update_one(
            {"email": email_clean},
            {"$set": {"passwordHash": new_hashed}}
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to change password: {e}")
        return False

def authenticate_user(username_or_email: str, password_raw: str) -> Optional[Dict[str, Any]]:
    """Authenticates a user by username/email and password, returning their profile if successful."""
    db = get_db()
    try:
        clean_val = username_or_email.strip().lower()
        user = db.users.find_one({
            "$or": [
                {"username": username_or_email.strip()},
                {"email": clean_val}
            ]
        })
        if not user:
            return None
            
        if verify_password(password_raw, user["passwordHash"]):
            return {
                "email": user["email"],
                "username": user.get("username", user["email"].split('@')[0]),
                "role": user["role"]
            }
        return None
    except Exception as e:
        print(f"[DB Error] Failed to authenticate user: {e}")
        return None

def get_admin_emails() -> List[str]:
    """Retrieves emails of all users with the role 'admin'."""
    db = get_db()
    try:
        admins = db.users.find({"role": "admin"}, {"email": 1})
        return [admin["email"] for admin in admins]
    except Exception as e:
        print(f"[DB Error] Failed to get admin emails: {e}")
        return []

def create_playlist(name: str, owner_email: str) -> Dict[str, Any]:
    """Creates a new playlist."""
    db = get_db()
    email_clean = owner_email.strip().lower()
    doc = {
        "name": name.strip(),
        "ownerEmail": email_clean,
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    }
    result = db.playlists.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

def get_playlist(playlist_id: str, owner_email: str = "", role: str = "user") -> Optional[Dict[str, Any]]:
    """Retrieves a single playlist."""
    db = get_db()
    try:
        try:
            oid = ObjectId(playlist_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": playlist_id}
            
        if owner_email and role != "admin":
            query.update(_build_owner_filter(owner_email, role))
            
        doc = db.playlists.find_one(query)
        if doc:
            return {
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "owner_email": doc.get("ownerEmail", ""),
                "created_at": doc.get("createdAt").isoformat() if isinstance(doc.get("createdAt"), datetime) else str(doc.get("createdAt", ""))
            }
        return None
    except Exception as e:
        print(f"[DB Error] Failed to get playlist: {e}")
        return None

def list_playlists(owner_email: str = "", role: str = "user") -> List[Dict[str, Any]]:
    """Lists playlists, sorted by creation time descending."""
    db = get_db()
    try:
        query = {}
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
            
        docs = db.playlists.find(query).sort("createdAt", -1)
        res = []
        for doc in docs:
            res.append({
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "owner_email": doc.get("ownerEmail", ""),
                "created_at": doc.get("createdAt").isoformat() if isinstance(doc.get("createdAt"), datetime) else str(doc.get("createdAt", ""))
            })
        return res
    except Exception as e:
        print(f"[DB Error] Failed to list playlists: {e}")
        return []

def delete_playlist(playlist_id: str, owner_email: str = "", role: str = "user") -> bool:
    """Deletes a playlist and cascades deletion to all videos inside it."""
    db = get_db()
    try:
        try:
            oid = ObjectId(playlist_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": playlist_id}
            
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
            
        playlist_doc = db.playlists.find_one(query)
        if not playlist_doc:
            return False
            
        actual_playlist_oid = playlist_doc["_id"]
        
        # Find all videos in this playlist
        videos_in_playlist = db.catalogs.find({"playlistId": actual_playlist_oid})
        for video in videos_in_playlist:
            # Delete each video using our existing delete_video helper
            delete_video(str(video["_id"]), owner_email=owner_email, role=role)
            
        # Cascade delete playlist-level quizzes
        db.quizzes.delete_many({"playlistId": actual_playlist_oid})

        # Delete the playlist itself
        db.playlists.delete_one({"_id": actual_playlist_oid})
        return True
    except Exception as e:
        print(f"[DB Error] Failed to delete playlist: {e}")
        return False

def update_video_playlist(video_id: str, playlist_id: Optional[str], owner_email: str = "", role: str = "user") -> bool:
    """Updates the playlist of a video. If playlist_id is empty/None, moves it to root (None)."""
    db = get_db()
    try:
        try:
            oid = ObjectId(video_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": video_id}
            
        if owner_email:
            query.update(_build_owner_filter(owner_email, role))
            
        video_doc = db.catalogs.find_one(query)
        if not video_doc:
            return False
            
        actual_oid = video_doc["_id"]
        
        if playlist_id:
            try:
                playlist_oid = ObjectId(playlist_id)
            except InvalidId:
                playlist_oid = playlist_id
        else:
            playlist_oid = None
            
        db.catalogs.update_one(
            {"_id": actual_oid},
            {"$set": {
                "playlistId": playlist_oid,
                "updatedAt": datetime.now()
            }}
        )
        return True
    except Exception as e:
        print(f"[DB Error] Failed to update video playlist: {e}")
        return False

def update_upload_status(video_id: str, status: str) -> bool:
    """Updates the upload status of a video."""
    db = get_db()
    try:
        try:
            oid = ObjectId(video_id)
        except InvalidId:
            oid = video_id
            
        result = db.catalogs.update_one(
            {"_id": oid},
            {"$set": {
                "uploadStatus": status,
                "updatedAt": datetime.now()
            }}
        )
        if result.matched_count == 0:
            raise VideoCancelledException("Video record has been deleted or processing cancelled.")
        return True
    except VideoCancelledException as e:
        print(f"[DB Info] Video cancellation detected for ID {video_id}: {e}")
        raise e
    except Exception as e:
        print(f"[DB Error] Failed to update upload status: {e}")
        return False

def save_quiz(title: str, created_by: str, catalog_id: str = None, playlist_id: str = None, questions: list = None, description: str = "") -> str:
    """Inserts or updates a quiz linked to either a catalog_id (video) or playlist_id."""
    db = get_db()
    cat_oid = None
    if catalog_id:
        try:
            cat_oid = ObjectId(catalog_id)
        except InvalidId:
            cat_oid = catalog_id

    play_oid = None
    if playlist_id:
        try:
            play_oid = ObjectId(playlist_id)
        except InvalidId:
            play_oid = playlist_id

    query = {}
    if cat_oid:
        query["catalogId"] = cat_oid
    elif play_oid:
        query["playlistId"] = play_oid
        query["catalogId"] = None
    else:
        raise ValueError("Either catalog_id or playlist_id must be provided.")

    quiz_doc = {
        "title": title,
        "description": description,
        "catalogId": cat_oid,
        "playlistId": play_oid,
        "questions": questions or [],
        "createdBy": created_by,
        "updatedAt": datetime.now()
    }

    existing = db.quizzes.find_one(query)
    if existing:
        db.quizzes.update_one({"_id": existing["_id"]}, {"$set": quiz_doc})
        return str(existing["_id"])
    else:
        quiz_doc["createdAt"] = datetime.now()
        res = db.quizzes.insert_one(quiz_doc)
        return str(res.inserted_id)

def get_quiz_by_target(catalog_id: str = None, playlist_id: str = None) -> Optional[dict]:
    """Retrieves a quiz by catalog_id (video) or playlist_id. Returns mapped dictionary or None."""
    db = get_db()
    query = {}
    if catalog_id:
        try:
            query["catalogId"] = ObjectId(catalog_id)
        except InvalidId:
            query["catalogId"] = catalog_id
    elif playlist_id:
        try:
            query["playlistId"] = ObjectId(playlist_id)
        except InvalidId:
            query["playlistId"] = playlist_id
        query["catalogId"] = None
    else:
        return None

    doc = db.quizzes.find_one(query)
    if doc:
        doc["_id"] = str(doc["_id"])
        if doc.get("catalogId"):
            doc["catalogId"] = str(doc["catalogId"])
        if doc.get("playlistId"):
            doc["playlistId"] = str(doc["playlistId"])
        return doc
    return None

def delete_quiz(quiz_id: str) -> bool:
    """Deletes a quiz by its ID."""
    db = get_db()
    try:
        try:
            oid = ObjectId(quiz_id)
            query = {"_id": oid}
        except InvalidId:
            query = {"_id": quiz_id}

        res = db.quizzes.delete_one(query)
        return res.deleted_count > 0
    except Exception as e:
        print(f"[DB Error] Failed to delete quiz: {e}")
        return False

def save_quiz_attempt(quiz_id: str, quiz_title: str, catalog_id: Optional[str], playlist_id: Optional[str], user_email: str, username: str, score: float, correct_count: int, total_count: int, results: list) -> str:
    """Saves a quiz attempt in the quiz_attempts collection, keeping only the best score."""
    db = get_db()
    try:
        from bson.objectid import ObjectId
        from bson.errors import InvalidId
        
        try:
            q_oid = ObjectId(quiz_id)
        except InvalidId:
            q_oid = quiz_id
            
        cat_oid = None
        if catalog_id:
            try:
                cat_oid = ObjectId(catalog_id)
            except InvalidId:
                cat_oid = catalog_id
                
        play_oid = None
        if playlist_id:
            try:
                play_oid = ObjectId(playlist_id)
            except InvalidId:
                play_oid = playlist_id
                
        clean_email = user_email.strip().lower() if user_email else "anonymous"
        existing = db.quiz_attempts.find_one({"userEmail": clean_email, "quizId": q_oid})
        
        if existing:
            attempts_count = existing.get("attemptsCount", 1) + 1
            if score > existing.get("score", 0.0):
                db.quiz_attempts.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "score": score,
                        "correctCount": correct_count,
                        "totalCount": total_count,
                        "results": results,
                        "submittedAt": datetime.now(),
                        "attemptsCount": attempts_count,
                        "quizTitle": quiz_title,
                        "catalogId": cat_oid,
                        "playlistId": play_oid,
                        "username": username.strip() if username else "Anonymous"
                    }}
                )
            else:
                db.quiz_attempts.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "attemptsCount": attempts_count
                    }}
                )
            return str(existing["_id"])
        else:
            doc = {
                "quizId": q_oid,
                "quizTitle": quiz_title,
                "catalogId": cat_oid,
                "playlistId": play_oid,
                "userEmail": clean_email,
                "username": username.strip() if username else "Anonymous",
                "score": score,
                "correctCount": correct_count,
                "totalCount": total_count,
                "results": results,
                "submittedAt": datetime.now(),
                "attemptsCount": 1
            }
            res = db.quiz_attempts.insert_one(doc)
            return str(res.inserted_id)
    except Exception as e:
        print(f"[DB Error] Failed to save quiz attempt: {e}")
        return ""

def get_quiz_attempts(quiz_id: str = None, user_email: str = None) -> list:
    """Retrieves quiz attempts, sorted by submission date descending."""
    db = get_db()
    try:
        from bson.objectid import ObjectId
        from bson.errors import InvalidId
        
        query = {}
        if quiz_id:
            try:
                query["quizId"] = ObjectId(quiz_id)
            except InvalidId:
                query["quizId"] = quiz_id
        if user_email:
            query["userEmail"] = user_email.strip().lower()
            
        cursor = db.quiz_attempts.find(query).sort("submittedAt", -1)
        attempts = []
        for doc in cursor:
            attempts.append({
                "id": str(doc["_id"]),
                "quizId": str(doc["quizId"]),
                "quizTitle": doc.get("quizTitle", "Untitled Quiz"),
                "catalogId": str(doc["catalogId"]) if doc.get("catalogId") else None,
                "playlistId": str(doc["playlistId"]) if doc.get("playlistId") else None,
                "userEmail": doc.get("userEmail", ""),
                "username": doc.get("username", ""),
                "score": doc.get("score", 0.0),
                "attemptsCount": doc.get("attemptsCount", 1),
                "correctCount": doc.get("correctCount", 0),
                "totalCount": doc.get("totalCount", 0),
                "results": doc.get("results", []),
                "submittedAt": doc.get("submittedAt", datetime.now()).isoformat() if isinstance(doc.get("submittedAt"), datetime) else str(doc.get("submittedAt", ""))
            })
        return attempts
    except Exception as e:
        print(f"[DB Error] Failed to get quiz attempts: {e}")
        return []

def add_watched_video(user_email: str, video_id: str) -> bool:
    """Stores a user's watched video progress in the database."""
    db = get_db()
    try:
        db.progress.update_one(
            {"user_email": user_email.strip().lower(), "video_id": video_id},
            {"$set": {"user_email": user_email.strip().lower(), "video_id": video_id}},
            upsert=True
        )
        print(f"[DB] Video '{video_id}' marked as watched for '{user_email}'. Status Code: 200")
        return True
    except Exception as e:
        print(f"[DB Error] Failed to store watched progress: {e}. Status Code: 500")
        return False

def get_watched_videos(user_email: str) -> list:
    """Retrieves list of watched video IDs for a user from the database."""
    db = get_db()
    try:
        cursor = db.progress.find({"user_email": user_email.strip().lower()})
        ids = [doc["video_id"] for doc in cursor]
        print(f"[DB] Retrieved {len(ids)} watched videos for '{user_email}'. Status Code: 200")
        return ids
    except Exception as e:
        print(f"[DB Error] Failed to retrieve watched progress: {e}. Status Code: 500")
        return []




