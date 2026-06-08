import sqlite3
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from src.config import get_db_path

def get_db_connection() -> sqlite3.Connection:
    """Establishes and returns a database connection with foreign key support enabled."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes the database schema if it doesn't already exist."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create videos table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            file_path TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            duration REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create semantic_blocks table with topic_title
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS semantic_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            topic_title TEXT NOT NULL DEFAULT 'Section',
            text TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
        )
    """)
    
    # Check if we need to migrate an existing database to add the topic_title column
    cursor.execute("PRAGMA table_info(semantic_blocks)")
    columns = [row[1] for row in cursor.fetchall()]
    if columns and "topic_title" not in columns:
        print("[DB Migration] Adding missing topic_title column to semantic_blocks table...")
        cursor.execute("ALTER TABLE semantic_blocks ADD COLUMN topic_title TEXT NOT NULL DEFAULT 'Section'")
    
    # Create indexes for faster queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocks_video_id ON semantic_blocks(video_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocks_start_time ON semantic_blocks(video_id, start_time)")
    
    conn.commit()
    conn.close()

def insert_video(video_id: str, file_path: str, file_name: str, duration: float) -> bool:
    """Inserts or replaces a video entry. Returns True on success."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("""
                INSERT OR REPLACE INTO videos (id, file_path, file_name, duration, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (video_id, file_path, file_name, duration, datetime.now().isoformat()))
        return True
    except sqlite3.Error as e:
        print(f"[DB Error] Failed to insert video: {e}")
        return False
    finally:
        conn.close()

def insert_semantic_blocks(video_id: str, blocks: List[Dict[str, Any]]) -> bool:
    """Inserts a batch of semantic blocks for a given video.
    
    Blocks must be a list of dictionaries with structure:
    {
        'start_time': float,
        'end_time': float,
        'topic_title': str,
        'text': str
    }
    """
    conn = get_db_connection()
    try:
        with conn:
            # First, clean up any existing blocks for this video to prevent duplicates
            conn.execute("DELETE FROM semantic_blocks WHERE video_id = ?", (video_id,))
            
            # Batch insert blocks including topic_title
            conn.executemany("""
                INSERT INTO semantic_blocks (video_id, start_time, end_time, topic_title, text)
                VALUES (?, ?, ?, ?, ?)
            """, [(video_id, b['start_time'], b['end_time'], b.get('topic_title', 'Section'), b['text']) for b in blocks])
        return True
    except sqlite3.Error as e:
        print(f"[DB Error] Failed to insert semantic blocks: {e}")
        return False
    finally:
        conn.close()

def get_video(video_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves metadata for a specific video."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def get_video_by_path(file_path: str) -> Optional[Dict[str, Any]]:
    """Retrieves metadata for a specific video by its path."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM videos WHERE file_path = ?", (file_path,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def list_videos() -> List[Dict[str, Any]]:
    """Lists all indexed videos, ordered by creation time descending."""
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM videos ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def get_video_blocks(video_id: str) -> List[Dict[str, Any]]:
    """Retrieves all semantic blocks for a given video, sorted by start time."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM semantic_blocks WHERE video_id = ? ORDER BY start_time ASC", 
            (video_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def search_blocks(video_id: str, query: str) -> List[Dict[str, Any]]:
    """Searches for keyword query in the semantic blocks of a specific video."""
    conn = get_db_connection()
    try:
        rows = conn.execute("""
            SELECT * FROM semantic_blocks 
            WHERE video_id = ? AND text LIKE ? 
            ORDER BY start_time ASC
        """, (video_id, f"%{query}%")).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def delete_video(video_id: str) -> bool:
    """Deletes a video and cascading blocks from the database."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        return True
    except sqlite3.Error as e:
        print(f"[DB Error] Failed to delete video: {e}")
        return False
    finally:
        conn.close()

def get_semantic_block(block_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves a specific semantic block by its unique ID."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM semantic_blocks WHERE id = ?", (block_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
