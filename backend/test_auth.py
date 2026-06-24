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

class TestAuthAndRoles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = db.get_db()
        self.test_email_user = "test_regular_user@summarix.io"
        self.test_email_admin = "test_admin_user@summarix.io"
        self.test_email_other_admin = "test_other_admin@summarix.io"
        self.test_email_other = "test_other_user@summarix.io"
        self.test_password = "securePassword123"
        
        # Clean up database records
        self.db.users.delete_many({"email": {"$in": [self.test_email_user, self.test_email_admin, self.test_email_other_admin, self.test_email_other]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.test_email_user, self.test_email_admin, self.test_email_other_admin, self.test_email_other]}})

    def tearDown(self):
        # Clean up database records
        self.db.users.delete_many({"email": {"$in": [self.test_email_user, self.test_email_admin, self.test_email_other_admin, self.test_email_other]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.test_email_user, self.test_email_admin, self.test_email_other_admin, self.test_email_other]}})

    def test_user_registration_and_login(self):
        """Test user registration and successful/failed logins."""
        # 1. Register a regular user
        reg_payload = {
            "email": self.test_email_user,
            "password": self.test_password,
            "role": "user",
            "username": "testuser"
        }
        res = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res.status_code, 200)
        resp_data = res.json()
        self.assertTrue(resp_data["success"])
        self.assertEqual(resp_data["email"], self.test_email_user)
        self.assertEqual(resp_data["username"], "testuser")
        self.assertEqual(resp_data["role"], "user")

        # 2. Register same email again (should fail)
        res_dup = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("already exists", res_dup.json()["detail"])

        # 3. Login with correct credentials
        login_payload = {
            "username": "testuser",
            "password": self.test_password
        }
        res_login = self.client.post("/api/auth/login", json=login_payload)
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.json()
        self.assertTrue(login_data["success"])
        self.assertEqual(login_data["email"], self.test_email_user)
        self.assertEqual(login_data["username"], "testuser")
        self.assertEqual(login_data["role"], "user")

        # 4. Login with incorrect credentials
        login_bad_payload = {
            "username": "testuser",
            "password": "wrong_password"
        }
        res_bad_login = self.client.post("/api/auth/login", json=login_bad_payload)
        self.assertEqual(res_bad_login.status_code, 401)

        # 5. Login using email as username (backward compatibility check)
        login_email_payload = {
            "username": self.test_email_user,
            "password": self.test_password
        }
        res_email_login = self.client.post("/api/auth/login", json=login_email_payload)
        self.assertEqual(res_email_login.status_code, 200)
        email_login_data = res_email_login.json()
        self.assertTrue(email_login_data["success"])
        self.assertEqual(email_login_data["username"], "testuser")

    def test_role_based_video_access(self):
        """Test that regular users see own and all admin videos, while admins see only their own uploads."""
        # Register User, Admin A, Admin B, and Other User
        db.create_user(self.test_email_user, self.test_password, "user")
        db.create_user(self.test_email_admin, self.test_password, "admin")
        db.create_user(self.test_email_other_admin, self.test_password, "admin")
        db.create_user(self.test_email_other, self.test_password, "user")

        # Insert video owned by regular user
        video_user_id = str(ObjectId())
        db.insert_video(
            video_id=video_user_id,
            file_path="user_vid.mp4",
            file_name="user_vid.mp4",
            duration=60.0,
            owner_email=self.test_email_user,
            upload_status="indexed"
        )

        # Insert video owned by Admin A
        video_admin_a_id = str(ObjectId())
        db.insert_video(
            video_id=video_admin_a_id,
            file_path="admin_a_vid.mp4",
            file_name="admin_a_vid.mp4",
            duration=120.0,
            owner_email=self.test_email_admin,
            upload_status="indexed"
        )

        # Insert video owned by Admin B
        video_admin_b_id = str(ObjectId())
        db.insert_video(
            video_id=video_admin_b_id,
            file_path="admin_b_vid.mp4",
            file_name="admin_b_vid.mp4",
            duration=180.0,
            owner_email=self.test_email_other_admin,
            upload_status="indexed"
        )

        # Insert video owned by another regular user (should remain private/unseen by self.test_email_user)
        video_other_id = str(ObjectId())
        db.insert_video(
            video_id=video_other_id,
            file_path="other_user_vid.mp4",
            file_name="other_user_vid.mp4",
            duration=90.0,
            owner_email=self.test_email_other,
            upload_status="indexed"
        )

        # 1. Query videos as regular User
        res_user = self.client.get(f"/api/videos?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_user.status_code, 200)
        user_videos = res_user.json()
        user_video_ids = [v["id"] for v in user_videos]
        
        # Regular user should see their own video AND all admin videos (Admin A and Admin B)
        self.assertIn(video_user_id, user_video_ids)
        self.assertIn(video_admin_a_id, user_video_ids)
        self.assertIn(video_admin_b_id, user_video_ids)
        # Regular user should NOT see the other regular user's video
        self.assertNotIn(video_other_id, user_video_ids)

        # 2. Query videos as Admin A
        res_admin_a = self.client.get(f"/api/videos?owner_email={self.test_email_admin}&role=admin")
        self.assertEqual(res_admin_a.status_code, 200)
        admin_a_videos = res_admin_a.json()
        admin_a_video_ids = [v["id"] for v in admin_a_videos]
        
        # Admin A should see ONLY their own video
        self.assertIn(video_admin_a_id, admin_a_video_ids)
        self.assertNotIn(video_user_id, admin_a_video_ids)
        self.assertNotIn(video_admin_b_id, admin_a_video_ids)
        self.assertNotIn(video_other_id, admin_a_video_ids)

        # 3. Query videos as Admin B
        res_admin_b = self.client.get(f"/api/videos?owner_email={self.test_email_other_admin}&role=admin")
        self.assertEqual(res_admin_b.status_code, 200)
        admin_b_videos = res_admin_b.json()
        admin_b_video_ids = [v["id"] for v in admin_b_videos]
        
        # Admin B should see ONLY their own video
        self.assertIn(video_admin_b_id, admin_b_video_ids)
        self.assertNotIn(video_user_id, admin_b_video_ids)
        self.assertNotIn(video_admin_a_id, admin_b_video_ids)
        self.assertNotIn(video_other_id, admin_b_video_ids)

        # 4. Regular User attempting to get admin's video details (should succeed)
        res_get_detail_admin_a = self.client.get(f"/api/videos/{video_admin_a_id}?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_get_detail_admin_a.status_code, 200)
        
        res_get_detail_admin_b = self.client.get(f"/api/videos/{video_admin_b_id}?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_get_detail_admin_b.status_code, 200)

        # 5. Regular User attempting to get another regular user's video details (should FAIL with 404)
        res_get_detail_other_bad = self.client.get(f"/api/videos/{video_other_id}?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_get_detail_other_bad.status_code, 404)

        # 6. Admin A attempting to get Admin B's video details (should FAIL with 404)
        res_admin_a_get_b = self.client.get(f"/api/videos/{video_admin_b_id}?owner_email={self.test_email_admin}&role=admin")
        self.assertEqual(res_admin_a_get_b.status_code, 404)

        # 7. Admin A attempting to get regular User's video details (should FAIL with 404)
        res_admin_a_get_user = self.client.get(f"/api/videos/{video_user_id}?owner_email={self.test_email_admin}&role=admin")
        self.assertEqual(res_admin_a_get_user.status_code, 404)

    def test_endpoint_restrictions(self):
        """Test that regular users are blocked from upload, index, and delete endpoints."""
        # 1. Test /api/upload as regular user (should get 403)
        res_upload = self.client.post(
            f"/api/upload?filename=test.mp4&owner_email={self.test_email_user}&role=user",
            content=b"dummy content"
        )
        self.assertEqual(res_upload.status_code, 403)
        self.assertIn("regular users are not allowed to upload", res_upload.json()["detail"])

        # 2. Test /api/index as regular user (should get 403)
        index_payload = {
            "video_path": "dummy_path.mp4"
        }
        res_index = self.client.post(
            f"/api/index?owner_email={self.test_email_user}&role=user",
            json=index_payload
        )
        self.assertEqual(res_index.status_code, 403)
        self.assertIn("regular users are not allowed to index", res_index.json()["detail"])

        # 3. Test /api/delete as regular user (should get 403)
        del_payload = {
            "video_id": str(ObjectId())
        }
        res_delete = self.client.post(
            f"/api/delete?owner_email={self.test_email_user}&role=user",
            json=del_payload
        )
        self.assertEqual(res_delete.status_code, 403)
        self.assertIn("regular users are not allowed to delete", res_delete.json()["detail"])

if __name__ == "__main__":
    unittest.main()
