import os
import unittest
import hashlib
from unittest.mock import patch, MagicMock

# Import the modules we want to test
from src.indexer import chunk_segments, generate_video_id, reconstruct_blocks_from_topics
import src.database as db

class TestIndexerChunking(unittest.TestCase):
    def test_empty_segments(self):
        """Should return empty list for empty input."""
        self.assertEqual(chunk_segments([]), [])

    def test_basic_chunking(self):
        """Should group segments that fall within the target duration."""
        segments = [
            {"start": 0.0, "end": 10.0, "text": "Hello"},
            {"start": 10.0, "end": 35.0, "text": "world"},
            {"start": 35.0, "end": 55.0, "text": "this is a"},
            {"start": 55.0, "end": 75.0, "text": "test segment."} # This crosses the 60s threshold from block_start (0.0)
        ]
        # target_duration = 60
        # Block 1 should contain segment 1, 2, 3 (duration from start 0.0 to 55.0 <= 60.0)
        # Segment 4 (ends at 75.0, so duration 75.0 > 60.0) should trigger a new block
        blocks = chunk_segments(segments, target_duration=60.0)
        
        self.assertEqual(len(blocks), 2)
        # Block 1
        self.assertEqual(blocks[0]["start_time"], 0.0)
        self.assertEqual(blocks[0]["end_time"], 55.0)
        self.assertEqual(blocks[0]["text"], "Hello world this is a")
        # Block 2
        self.assertEqual(blocks[1]["start_time"], 55.0)
        self.assertEqual(blocks[1]["end_time"], 75.0)
        self.assertEqual(blocks[1]["text"], "test segment.")

    def test_single_long_segment(self):
        """Should handle segments that are longer than the target duration on their own."""
        segments = [
            {"start": 0.0, "end": 75.0, "text": "Very long monologue segment."}
        ]
        blocks = chunk_segments(segments, target_duration=60.0)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["start_time"], 0.0)
        self.assertEqual(blocks[0]["end_time"], 75.0)
        self.assertEqual(blocks[0]["text"], "Very long monologue segment.")

    def test_reconstruct_blocks_from_topics(self):
        """Should group segments within the start_time of topics, and calculate correct end times."""
        segments = [
            {"start": 0.0, "end": 5.0, "text": "Welcome to Python."},
            {"start": 5.0, "end": 12.0, "text": "Python is easy to learn."},
            {"start": 12.0, "end": 20.0, "text": "Now, let's talk about Whisper."},
            {"start": 20.0, "end": 30.0, "text": "Whisper does speech to text."}
        ]
        topics = [
            {"start_time": 0.0, "topic": "Python Introduction"},
            {"start_time": 12.0, "topic": "Whisper Overview"}
        ]
        video_duration = 35.0
        
        blocks = reconstruct_blocks_from_topics(segments, topics, video_duration)
        
        self.assertEqual(len(blocks), 2)
        # Block 1: Python Introduction
        self.assertEqual(blocks[0]["start_time"], 0.0)
        self.assertEqual(blocks[0]["end_time"], 12.0)
        self.assertEqual(blocks[0]["topic_title"], "Python Introduction")
        self.assertEqual(blocks[0]["text"], "Welcome to Python. Python is easy to learn.")
        
        # Block 2: Whisper Overview
        self.assertEqual(blocks[1]["start_time"], 12.0)
        self.assertEqual(blocks[1]["end_time"], 35.0)
        self.assertEqual(blocks[1]["topic_title"], "Whisper Overview")
        self.assertEqual(blocks[1]["text"], "Now, let's talk about Whisper. Whisper does speech to text.")

    def test_write_transcript_txt(self):
        """Should format and write dialogue segments to a text file."""
        segments = [
            {"start": 0.0, "end": 5.0, "text": "Welcome to Python."},
            {"start": 65.0, "end": 72.0, "text": "Learning is fun."}
        ]
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "test_transcript.txt")
            from src.indexer import write_transcript_txt
            write_transcript_txt(segments, out_file)
            
            self.assertTrue(os.path.exists(out_file))
            with open(out_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            expected = "[00:00 -> 00:05] Welcome to Python.\n[01:05 -> 01:12] Learning is fun.\n"
            self.assertEqual(content, expected)

    def test_parse_transcript_txt(self):
        """Should parse dialogue transcript file back to segment list."""
        content = "[00:00 -> 00:05] Welcome to Python.\n[01:05 -> 01:12] Learning is fun.\n"
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "test_parse.txt")
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            from src.indexer import parse_transcript_txt
            segments = parse_transcript_txt(file_path)
            
            self.assertEqual(len(segments), 2)
            # Segment 1
            self.assertEqual(segments[0]["start"], 0.0)
            self.assertEqual(segments[0]["end"], 5.0)
            self.assertEqual(segments[0]["text"], "Welcome to Python.")
            # Segment 2
            self.assertEqual(segments[1]["start"], 65.0)
            self.assertEqual(segments[1]["end"], 72.0)
            self.assertEqual(segments[1]["text"], "Learning is fun.")

class TestDatabaseOperations(unittest.TestCase):
    def setUp(self):
        from pymongo import MongoClient
        # Connect using MONGODB_URI or default to local mongodb
        uri = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/summarix")
        self.client = MongoClient(uri)
        self.test_db = self.client["summarix_test_suite"]
        
        self.patcher = patch("src.database.get_db")
        self.mock_get_db = self.patcher.start()
        self.mock_get_db.return_value = self.test_db
        
        # Clean up collections before each test
        self.test_db.catalogs.delete_many({})
        self.test_db.indices.delete_many({})
        self.test_db.summaries.delete_many({})
        
        # Ensure indexes are built
        db.init_db()

    def tearDown(self):
        # Clean up collections after each test
        self.test_db.catalogs.delete_many({})
        self.test_db.indices.delete_many({})
        self.test_db.summaries.delete_many({})
        self.patcher.stop()
        self.client.close()

    def test_insert_and_get_video(self):
        """Should successfully insert and retrieve video metadata."""
        video_id = "test_vid_1"
        file_path = "/path/to/test.mp4"
        file_name = "test.mp4"
        duration = 125.5
        
        success = db.insert_video(video_id, file_path, file_name, duration)
        self.assertTrue(success)
        
        video = db.get_video(video_id)
        self.assertIsNotNone(video)
        self.assertEqual(video["id"], video_id)
        self.assertEqual(video["file_path"], file_path)
        self.assertEqual(video["file_name"], file_name)
        self.assertEqual(video["duration"], duration)

    def test_insert_and_get_blocks(self):
        """Should successfully insert and retrieve semantic blocks for a video."""
        video_id = "test_vid_2"
        db.insert_video(video_id, "/path/to/test2.mp4", "test2.mp4", 150.0)
        
        blocks = [
            {"start_time": 0.0, "end_time": 50.0, "topic_title": "Intro", "text": "Block 1 content"},
            {"start_time": 50.0, "end_time": 110.0, "topic_title": "Setup", "text": "Block 2 content"},
        ]
        
        success = db.insert_semantic_blocks(video_id, blocks)
        self.assertTrue(success)
        
        retrieved = db.get_video_blocks(video_id)
        self.assertEqual(len(retrieved), 2)
        self.assertEqual(retrieved[0]["start_time"], 0.0)
        self.assertEqual(retrieved[0]["topic_title"], "Intro")
        self.assertEqual(retrieved[0]["text"], "Block 1 content")
        self.assertEqual(retrieved[1]["start_time"], 50.0)
        self.assertEqual(retrieved[1]["topic_title"], "Setup")
        self.assertEqual(retrieved[1]["text"], "Block 2 content")

    def test_search_blocks(self):
        """Should successfully search block transcripts for keywords."""
        video_id = "test_vid_3"
        db.insert_video(video_id, "/path/to/test3.mp4", "test3.mp4", 100.0)
        
        blocks = [
            {"start_time": 0.0, "end_time": 45.0, "topic_title": "Python coding", "text": "This is about Python scripting"},
            {"start_time": 45.0, "end_time": 90.0, "topic_title": "Whisper info", "text": "Here we discuss offline Whisper Docker setup"},
        ]
        db.insert_semantic_blocks(video_id, blocks)
        
        # Search for 'python'
        python_results = db.search_blocks(video_id, "Python")
        self.assertEqual(len(python_results), 1)
        self.assertIn("Python", python_results[0]["text"])
        
        # Search for 'whisper' (case insensitive search test)
        whisper_results = db.search_blocks(video_id, "whisper")
        self.assertEqual(len(whisper_results), 1)
        self.assertIn("Whisper", whisper_results[0]["text"])

    def test_delete_cascade(self):
        """Should delete blocks associated with a video when the video is deleted."""
        video_id = "test_vid_4"
        db.insert_video(video_id, "/path/to/test4.mp4", "test4.mp4", 90.0)
        
        blocks = [
            {"start_time": 0.0, "end_time": 60.0, "topic_title": "Topic", "text": "Block text"}
        ]
        db.insert_semantic_blocks(video_id, blocks)
        
        # Delete video
        db.delete_video(video_id)
        
        # Verify video and blocks are gone
        self.assertIsNone(db.get_video(video_id))
        self.assertEqual(len(db.get_video_blocks(video_id)), 0)

    def test_get_semantic_block(self):
        """Should retrieve a specific block by its unique database ID."""
        video_id = "test_vid_5"
        db.insert_video(video_id, "/path/to/test5.mp4", "test5.mp4", 90.0)
        
        blocks = [
            {"start_time": 0.0, "end_time": 60.0, "topic_title": "UniqueTopic", "text": "Unique text"}
        ]
        db.insert_semantic_blocks(video_id, blocks)
        
        # Get blocks to find the autogenerated ID
        retrieved_blocks = db.get_video_blocks(video_id)
        self.assertEqual(len(retrieved_blocks), 1)
        block_id = retrieved_blocks[0]["id"]
        
        # Retrieve using get_semantic_block
        single_block = db.get_semantic_block(block_id)
        self.assertIsNotNone(single_block)
        self.assertEqual(single_block["topic_title"], "UniqueTopic")
        self.assertEqual(single_block["text"], "Unique text")
        
        # Retrieval for non-existent ID should return None
        self.assertIsNone(db.get_semantic_block("nonexistent_id"))

    def test_chapter_id_resolution(self):
        """Should verify we can resolve <video_id>-<index> to a correct block."""
        video_id = "test_vid_6"
        db.insert_video(video_id, "/path/to/test6.mp4", "test6.mp4", 90.0)
        
        blocks = [
            {"start_time": 0.0, "end_time": 30.0, "topic_title": "First", "text": "First part"},
            {"start_time": 30.0, "end_time": 60.0, "topic_title": "Second", "text": "Second part"},
            {"start_time": 60.0, "end_time": 90.0, "topic_title": "Third", "text": "Third part"}
        ]
        db.insert_semantic_blocks(video_id, blocks)
        
        # Fetch blocks to check ordering and indexes
        retrieved_blocks = db.get_video_blocks(video_id)
        self.assertEqual(len(retrieved_blocks), 3)
        self.assertEqual(retrieved_blocks[0]["topic_title"], "First")
        self.assertEqual(retrieved_blocks[1]["topic_title"], "Second")
        self.assertEqual(retrieved_blocks[2]["topic_title"], "Third")

class TestGeminiChunkingFallback(unittest.TestCase):
    @patch("src.indexer.GEMINI_AVAILABLE", True)
    @patch("os.getenv")
    @patch("google.genai.Client")
    def test_fallback_when_primary_fails(self, mock_client_class, mock_getenv):
        # Setup mock environment
        def getenv_side_effect(key, default=None):
            if key == "GEMINI_API_KEY":
                return "dummy_api_key"
            if key == "GEMINI_MODEL":
                return "gemini-1.5-flash"
            return default
        mock_getenv.side_effect = getenv_side_effect
        
        # Setup mock client
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Mock generate_content to raise 404 for gemini-1.5-flash, but succeed for gemini-3.1-flash-lite
        def generate_content_side_effect(model, contents, config):
            if model == "gemini-1.5-flash":
                raise Exception("404 NOT_FOUND: model not found")
            elif model == "gemini-3.1-flash-lite":
                response = MagicMock()
                response.text = '[{"start_time": 0.0, "topic": "Introduction"}]'
                return response
            raise Exception("Unknown model")
            
        mock_client.models.generate_content.side_effect = generate_content_side_effect
        
        # Call chunk_semantically_with_gemini
        from src.indexer import chunk_semantically_with_gemini
        
        timeline_str = "[00:00 -> 00:10] Hello world\n"
        segments = [{"start": 0.0, "end": 10.0, "text": "Hello world"}]
        blocks = chunk_semantically_with_gemini(timeline_str, segments, 10.0)
        
        # Verify blocks was correctly reconstructed using the fallback model
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["topic_title"], "Introduction")
        self.assertEqual(blocks[0]["text"], "Hello world")
        
        # Verify that client.models.generate_content was called twice
        self.assertEqual(mock_client.models.generate_content.call_count, 2)
        
        calls = mock_client.models.generate_content.call_args_list
        self.assertEqual(calls[0].kwargs["model"], "gemini-1.5-flash")
        self.assertEqual(calls[1].kwargs["model"], "gemini-3.1-flash-lite")

    @patch("src.indexer.GEMINI_AVAILABLE", True)
    @patch("os.getenv")
    @patch("google.genai.Client")
    def test_local_fallback_when_all_fail(self, mock_client_class, mock_getenv):
        # Setup mock environment
        def getenv_side_effect(key, default=None):
            if key == "GEMINI_API_KEY":
                return "dummy_api_key"
            if key == "GEMINI_MODEL":
                return "gemini-1.5-flash"
            return default
        mock_getenv.side_effect = getenv_side_effect
        
        # Setup mock client
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.models.generate_content.side_effect = Exception("All models failed")
        
        # Call chunk_semantically_with_gemini
        from src.indexer import chunk_semantically_with_gemini
        
        timeline_str = "[00:00 -> 00:10] Hello world\n"
        segments = [{"start": 0.0, "end": 10.0, "text": "Hello world"}]
        blocks = chunk_semantically_with_gemini(timeline_str, segments, 10.0)
        
        # Verify it fell back to local chunking (Section 1)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["topic_title"], "Section 1")
        self.assertEqual(blocks[0]["text"], "Hello world")

if __name__ == "__main__":
    unittest.main()
