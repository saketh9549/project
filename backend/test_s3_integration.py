import os
import unittest
import dotenv
from unittest.mock import patch, MagicMock
from bson.objectid import ObjectId
from fastapi.testclient import TestClient

# Load environment variables
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
from src.s3 import generate_s3_download_url, upload_file_stream_to_s3, delete_s3_object
from server import app

class TestS3Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = db.get_db()
        self.owner_email = "test_s3_owner@summarix.io"
        # Clean up database
        self.db.catalogs.delete_many({"ownerEmail": self.owner_email})
        
    def tearDown(self):
        # Clean up
        self.db.catalogs.delete_many({"ownerEmail": self.owner_email})

    @patch("src.s3.get_s3_client")
    def test_s3_upload_stream_mock(self, mock_get_client):
        """Test that stream upload calls boto3 client upload_fileobj."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        os.environ["AWS_S3_BUCKET"] = "test-bucket"
        
        mock_file = MagicMock()
        key = "videos/test_s3_owner@summarix.io/test.mp4"
        
        success = upload_file_stream_to_s3(mock_file, key, "video/mp4")
        self.assertTrue(success)
        mock_client.upload_fileobj.assert_called_once_with(
            mock_file,
            "test-bucket",
            key,
            ExtraArgs={"ContentType": "video/mp4"}
        )

    @patch("src.s3.get_s3_client")
    def test_s3_presigned_url_generation_mock(self, mock_get_client):
        """Test generating pre-signed URL returns mocked url."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.generate_presigned_url.return_value = "https://mock-s3-presigned-url.com/video.mp4?expired=123"
        
        os.environ["AWS_S3_BUCKET"] = "test-bucket"
        
        key = "videos/test_s3_owner@summarix.io/test.mp4"
        url = generate_s3_download_url(key)
        
        self.assertEqual(url, "https://mock-s3-presigned-url.com/video.mp4?expired=123")
        mock_client.generate_presigned_url.assert_called_once_with(
            'get_object',
            Params={'Bucket': 'test-bucket', 'Key': key},
            ExpiresIn=3600
        )

    @patch("src.s3.get_s3_client")
    def test_s3_cascade_delete(self, mock_get_client):
        """Test S3 delete object is triggered upon database catalog deletion."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        os.environ["AWS_S3_BUCKET"] = "test-bucket"
        
        video_id = str(ObjectId())
        s3_key = "videos/test_s3_owner@summarix.io/test_delete.mp4"
        
        # Insert S3 catalog record
        success = db.insert_video(
            video_id=video_id,
            file_path="test_delete.mp4",
            file_name="test_delete.mp4",
            duration=15.5,
            owner_email=self.owner_email,
            upload_status="indexed",
            s3_key=s3_key,
            s3_bucket="test-bucket"
        )
        self.assertTrue(success)
        
        # Verify db contains it
        catalog = db.get_video(video_id, self.owner_email)
        self.assertIsNotNone(catalog)
        self.assertEqual(catalog["absolute_local_path"], "")
        self.assertEqual(catalog["s3_key"], s3_key)
        self.assertEqual(catalog["s3_bucket"], "test-bucket")
        
        # Perform deletion
        del_success = db.delete_video(video_id, self.owner_email)
        self.assertTrue(del_success)
        
        # Assert S3 delete client method was called
        mock_client.delete_object.assert_called_once_with(
            Bucket="test-bucket",
            Key=s3_key
        )

    @patch("src.s3.get_s3_client")
    def test_stream_video_proxy_200(self, mock_get_client):
        """Test that stream endpoint proxies the full video from S3 with a 200 response."""
        import io
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock head_object and get_object
        mock_client.head_object.return_value = {
            'ContentLength': 10,
            'ContentType': 'video/mp4'
        }
        mock_body = io.BytesIO(b"0123456789")
        mock_client.get_object.return_value = {
            'Body': mock_body
        }
        
        os.environ["AWS_S3_BUCKET"] = "test-bucket"
        
        video_id = str(ObjectId())
        s3_key = "videos/test_s3_owner@summarix.io/test_proxy.mp4"
        
        # Insert S3 record
        db.insert_video(
            video_id=video_id,
            file_path="test_proxy.mp4",
            file_name="test_proxy.mp4",
            duration=120.0,
            owner_email=self.owner_email,
            upload_status="indexed",
            s3_key=s3_key,
            s3_bucket="test-bucket"
        )
        
        # Query local server endpoint using TestClient
        url = f"/api/stream-local-video?video_id={video_id}"
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "video/mp4")
        self.assertEqual(response.headers.get("content-length"), "10")
        self.assertEqual(response.content, b"0123456789")
        
        # Cleanup
        db.delete_video(video_id, self.owner_email)

    @patch("src.s3.get_s3_client")
    def test_stream_video_proxy_206(self, mock_get_client):
        """Test that stream endpoint handles range requests and proxies partial content from S3 with 206."""
        import io
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        mock_client.head_object.return_value = {
            'ContentLength': 10,
            'ContentType': 'video/mp4'
        }
        mock_body = io.BytesIO(b"3456")
        mock_client.get_object.return_value = {
            'Body': mock_body
        }
        
        os.environ["AWS_S3_BUCKET"] = "test-bucket"
        
        video_id = str(ObjectId())
        s3_key = "videos/test_s3_owner@summarix.io/test_proxy_range.mp4"
        
        # Insert S3 record
        db.insert_video(
            video_id=video_id,
            file_path="test_proxy_range.mp4",
            file_name="test_proxy_range.mp4",
            duration=120.0,
            owner_email=self.owner_email,
            upload_status="indexed",
            s3_key=s3_key,
            s3_bucket="test-bucket"
        )
        
        # Query local server endpoint with Range header using TestClient
        url = f"/api/stream-local-video?video_id={video_id}"
        headers = {"Range": "bytes=3-6"}
        
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers.get("content-type"), "video/mp4")
        self.assertEqual(response.headers.get("content-range"), "bytes 3-6/10")
        self.assertEqual(response.headers.get("content-length"), "4")
        self.assertEqual(response.content, b"3456")
        
        # Verify s3 client was called with Range='bytes=3-6'
        mock_client.get_object.assert_called_once_with(
            Bucket="test-bucket",
            Key=s3_key,
            Range="bytes=3-6"
        )
        
        # Cleanup
        db.delete_video(video_id, self.owner_email)

if __name__ == "__main__":
    unittest.main()
