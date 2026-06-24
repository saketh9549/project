import os
import unittest
import gridfs
from bson.objectid import ObjectId
from fastapi.testclient import TestClient

# Load environment variables
import dotenv
dotenv.load_dotenv(".env")

# Re-route MONGODB_URI to test suite database to avoid wiping live/development data
import urllib.parse
uri = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/summarix_test")
parsed = urllib.parse.urlparse(uri)
if parsed.scheme:
    new_uri = f"{parsed.scheme}://{parsed.netloc}/summarix_test_suite"
    if parsed.query:
        new_uri += f"?{parsed.query}"
    os.environ["MONGODB_URI"] = new_uri

import src.database as db
from server import app

class TestGridFSStreaming(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = db.get_db()
        # Clean up catalog and indices before test
        self.db.catalogs.delete_many({"ownerEmail": "test_streaming_owner@test.com"})
        
    def tearDown(self):
        # Clean up
        self.db.catalogs.delete_many({"ownerEmail": "test_streaming_owner@test.com"})
        
    def test_gridfs_cascade_delete(self):
        """Test that deleting a video cascade-deletes the GridFS file."""
        fs = gridfs.GridFS(self.db)
        
        # 1. Store mock video in GridFS
        mock_bytes = b"Hello, this is a mock video stream for GridFS testing."
        grid_file_id = fs.put(mock_bytes, filename="test_mock.mp4", content_type="video/mp4")
        self.assertTrue(fs.exists(grid_file_id))
        
        # 2. Insert catalog document linking to GridFS file
        video_id = str(ObjectId())
        success = db.insert_video(
            video_id=video_id,
            file_path="test_mock.mp4",
            file_name="test_mock.mp4",
            duration=10.0,
            owner_email="test_streaming_owner@test.com",
            upload_status="indexed",
            grid_fs_id=str(grid_file_id)
        )
        self.assertTrue(success)
        
        # Verify catalog entry in database has empty absoluteLocalPath
        catalog = self.db.catalogs.find_one({"_id": ObjectId(video_id)})
        self.assertIsNotNone(catalog)
        self.assertEqual(catalog.get("absoluteLocalPath"), "")
        self.assertEqual(catalog.get("gridFsFileId"), grid_file_id)
        
        # 3. Call db.delete_video to delete the catalog document
        del_success = db.delete_video(video_id, "test_streaming_owner@test.com")
        self.assertTrue(del_success)
        
        # 4. Verify catalog is deleted
        self.assertIsNone(self.db.catalogs.find_one({"_id": ObjectId(video_id)}))
        
        # 5. Verify GridFS file is deleted (cascade delete)
        self.assertFalse(fs.exists(grid_file_id))

    def test_http_range_streaming(self):
        """Test range request streaming via the running server API."""
        fs = gridfs.GridFS(self.db)
        
        # 1. Store a larger mock file in GridFS (10KB)
        mock_data = b"0123456789" * 1000  # 10,000 bytes
        grid_file_id = fs.put(mock_data, filename="test_range.mp4", content_type="video/mp4")
        
        # 2. Insert catalog document
        video_id = str(ObjectId())
        db.insert_video(
            video_id=video_id,
            file_path="test_range.mp4",
            file_name="test_range.mp4",
            duration=10.0,
            owner_email="test_streaming_owner@test.com",
            upload_status="indexed",
            grid_fs_id=str(grid_file_id)
        )
        
        # 3. Make range requests using TestClient
        url = f"/api/stream-local-video?video_id={video_id}"
        
        # First request: standard full file response (no Range header)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "video/mp4")
        self.assertEqual(int(response.headers.get("content-length")), len(mock_data))
        self.assertEqual(response.content, mock_data)
        
        # Second request: Range bytes=100-500
        headers = {"Range": "bytes=100-500"}
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers.get("content-type"), "video/mp4")
        self.assertEqual(response.headers.get("content-range"), "bytes 100-500/10000")
        self.assertEqual(int(response.headers.get("content-length")), 401)
        self.assertEqual(response.content, mock_data[100:501])
        
        # Third request: Range bytes=9000-
        headers = {"Range": "bytes=9000-"}
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers.get("content-type"), "video/mp4")
        self.assertEqual(response.headers.get("content-range"), "bytes 9000-9999/10000")
        self.assertEqual(int(response.headers.get("content-length")), 1000)
        self.assertEqual(response.content, mock_data[9000:])
        
        # Fourth request: invalid range
        headers = {"Range": "bytes=12000-15000"}
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 416)

        # Cleanup
        db.delete_video(video_id, "test_streaming_owner@test.com")

if __name__ == "__main__":
    unittest.main()
