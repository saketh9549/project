import os
import urllib.parse
import hashlib
import secrets
from typing import List, Dict, Any, Optional
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
from src.config import get_mongodb_uri

_client = None

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
    print("[DB] MongoDB collections and indexes initialized successfully.")

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

def insert_video(video_id: str, file_path: str, file_name: str, duration: float, owner_email: str = "", upload_status: str = "indexed", raw_transcript: str = "", overall_summary: str = "", absolute_local_path: str = None, grid_fs_id: str = None, s3_key: str = None, s3_bucket: str = None) -> bool:
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
            
        update_fields = {
            "fileName": file_name,
            "fileType": file_type,
            "filePath": file_path,
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
                "createdAt": datetime.now(),
                "history": [history_entry]
            }
        }
        
        if existing:
            update_doc["$push"] = {
                "history": history_entry
            }
            
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
            
        if owner_email:
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
        docs = db.catalogs.find(query).sort("createdAt", -1)
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
        
        # Cascade delete indices and summaries
        db.summaries.delete_many({"catalogId": actual_oid})
        db.indices.delete_many({"catalogId": actual_oid})
        
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

def create_user(email: str, password_raw: str, role: str) -> Optional[Dict[str, Any]]:
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
        user_doc = {
            "email": email_clean,
            "passwordHash": hashed,
            "role": role_clean,
            "createdAt": datetime.now()
        }
        db.users.insert_one(user_doc)
        return {
            "email": email_clean,
            "role": role_clean
        }
    except Exception as e:
        print(f"[DB Error] Failed to create user: {e}")
        return None

def authenticate_user(email: str, password_raw: str) -> Optional[Dict[str, Any]]:
    """Authenticates a user by email and password, returning their profile if successful."""
    db = get_db()
    try:
        email_clean = email.strip().lower()
        user = db.users.find_one({"email": email_clean})
        if not user:
            return None
            
        if verify_password(password_raw, user["passwordHash"]):
            return {
                "email": user["email"],
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

