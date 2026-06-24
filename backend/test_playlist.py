import os
import unittest
import dotenv
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
from server import app

class TestPlaylist(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = db.get_db()
        self.admin_email = "playlist_admin@summarix.io"
        self.user_email = "playlist_user@summarix.io"
        
        # Clean up database
        self.db.playlists.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})

    def tearDown(self):
        # Clean up
        self.db.playlists.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})

    def test_database_crud(self):
        # 1. Create playlist
        playlist = db.create_playlist("Python basics", self.admin_email)
        self.assertIsNotNone(playlist)
        self.assertEqual(playlist["name"], "Python basics")
        self.assertEqual(playlist["ownerEmail"], self.admin_email)
        playlist_id = playlist["id"]
        
        # 2. Get playlist
        pl_get = db.get_playlist(playlist_id, self.admin_email, "admin")
        self.assertIsNotNone(pl_get)
        self.assertEqual(pl_get["name"], "Python basics")
        
        # 3. List playlists
        pl_list = db.list_playlists(self.admin_email, "admin")
        self.assertEqual(len(pl_list), 1)
        self.assertEqual(pl_list[0]["id"], playlist_id)

    def test_cascading_deletion(self):
        playlist = db.create_playlist("React series", self.admin_email)
        playlist_id = playlist["id"]
        
        # Create a video in this playlist
        video_id1 = str(ObjectId())
        db.insert_video(
            video_id=video_id1,
            file_path="react_v1.mp4",
            file_name="react_v1.mp4",
            duration=30.0,
            owner_email=self.admin_email,
            playlist_id=playlist_id
        )
        
        # Create another video (standalone)
        video_id2 = str(ObjectId())
        db.insert_video(
            video_id=video_id2,
            file_path="standalone.mp4",
            file_name="standalone.mp4",
            duration=120.0,
            owner_email=self.admin_email
        )
        
        # Verify video is linked to playlist
        v1 = db.get_video(video_id1, self.admin_email, "admin")
        self.assertEqual(v1["playlist_id"], playlist_id)
        
        # Delete playlist - should cascade and delete v1, but keep v2
        success = db.delete_playlist(playlist_id, self.admin_email, "admin")
        self.assertTrue(success)
        
        # Check database
        self.assertIsNone(db.get_playlist(playlist_id, self.admin_email, "admin"))
        self.assertIsNone(db.get_video(video_id1, self.admin_email, "admin"))
        self.assertIsNotNone(db.get_video(video_id2, self.admin_email, "admin"))

    def test_api_endpoints_role_checks(self):
        # 1. Non-admin create playlist should be forbidden
        response = self.client.post(
            f"/api/playlists?owner_email={self.user_email}&role=user",
            json={"name": "Forbidden Playlist"}
        )
        self.assertEqual(response.status_code, 403)
        
        # 2. Admin create playlist should succeed
        response = self.client.post(
            f"/api/playlists?owner_email={self.admin_email}&role=admin",
            json={"name": "Admin Playlist"}
        )
        self.assertEqual(response.status_code, 200)
        playlist_data = response.json()
        playlist_id = playlist_data["id"]
        
        # 3. Retrieve playlists (should work for both)
        response = self.client.get(f"/api/playlists?owner_email={self.user_email}&role=user")
        self.assertEqual(response.status_code, 200)
        
        # 4. Non-admin delete playlist should be forbidden
        response = self.client.delete(f"/api/playlists/{playlist_id}?owner_email={self.user_email}&role=user")
        self.assertEqual(response.status_code, 403)
        
        # 5. Admin delete playlist should succeed
        response = self.client.delete(f"/api/playlists/{playlist_id}?owner_email={self.admin_email}&role=admin")
        self.assertEqual(response.status_code, 200)

    def test_api_patch_video_playlist(self):
        # 1. Create a playlist
        playlist = db.create_playlist("Patch Test Folder", self.admin_email)
        playlist_id = playlist["id"]
        
        # 2. Create a video at root
        video_id = str(ObjectId())
        db.insert_video(
            video_id=video_id,
            file_path="patch_test.mp4",
            file_name="patch_test.mp4",
            duration=45.0,
            owner_email=self.admin_email
        )
        
        # Verify it has no playlist initially
        video = db.get_video(video_id, self.admin_email, "admin")
        self.assertIsNone(video["playlist_id"])
        
        # 3. Patch video to move it to folder (by user - should fail 403)
        response = self.client.patch(
            f"/api/videos/{video_id}/playlist?owner_email={self.user_email}&role=user",
            json={"playlist_id": playlist_id}
        )
        self.assertEqual(response.status_code, 403)
        
        # 4. Patch video to move it to folder (by admin - should succeed 200)
        response = self.client.patch(
            f"/api/videos/{video_id}/playlist?owner_email={self.admin_email}&role=admin",
            json={"playlist_id": playlist_id}
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify it now belongs to folder
        video = db.get_video(video_id, self.admin_email, "admin")
        self.assertEqual(video["playlist_id"], playlist_id)
        
        # 5. Patch video to move it back to root (playlist_id = None)
        response = self.client.patch(
            f"/api/videos/{video_id}/playlist?owner_email={self.admin_email}&role=admin",
            json={"playlist_id": None}
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify it's back to root
        video = db.get_video(video_id, self.admin_email, "admin")
        self.assertIsNone(video["playlist_id"])

