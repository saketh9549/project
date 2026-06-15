import os
import unittest
import dotenv
from bson.objectid import ObjectId
from fastapi.testclient import TestClient

# Load environment variables
dotenv.load_dotenv(".env")

# Set local MongoDB URI for testing if not already specified
if "MONGODB_URI" not in os.environ:
    os.environ["MONGODB_URI"] = "mongodb://127.0.0.1:27017/summarix_test"

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
        self.test_password = "securePassword123"
        
        # Clean up database records
        self.db.users.delete_many({"email": {"$in": [self.test_email_user, self.test_email_admin]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.test_email_user, self.test_email_admin]}})

    def tearDown(self):
        # Clean up database records
        self.db.users.delete_many({"email": {"$in": [self.test_email_user, self.test_email_admin]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.test_email_user, self.test_email_admin]}})

    def test_user_registration_and_login(self):
        """Test user registration and successful/failed logins."""
        # 1. Register a regular user
        reg_payload = {
            "email": self.test_email_user,
            "password": self.test_password,
            "role": "user"
        }
        res = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res.status_code, 200)
        resp_data = res.json()
        self.assertTrue(resp_data["success"])
        self.assertEqual(resp_data["email"], self.test_email_user)
        self.assertEqual(resp_data["role"], "user")

        # 2. Register same email again (should fail)
        res_dup = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("already exists", res_dup.json()["detail"])

        # 3. Login with correct credentials
        login_payload = {
            "email": self.test_email_user,
            "password": self.test_password
        }
        res_login = self.client.post("/api/auth/login", json=login_payload)
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.json()
        self.assertTrue(login_data["success"])
        self.assertEqual(login_data["email"], self.test_email_user)
        self.assertEqual(login_data["role"], "user")

        # 4. Login with incorrect credentials
        login_bad_payload = {
            "email": self.test_email_user,
            "password": "wrong_password"
        }
        res_bad_login = self.client.post("/api/auth/login", json=login_bad_payload)
        self.assertEqual(res_bad_login.status_code, 401)

    def test_role_based_video_access(self):
        """Test that regular users can only see their own videos, but admins can see all."""
        # Register User and Admin
        db.create_user(self.test_email_user, self.test_password, "user")
        db.create_user(self.test_email_admin, self.test_password, "admin")

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

        # Insert video owned by admin
        video_admin_id = str(ObjectId())
        db.insert_video(
            video_id=video_admin_id,
            file_path="admin_vid.mp4",
            file_name="admin_vid.mp4",
            duration=120.0,
            owner_email=self.test_email_admin,
            upload_status="indexed"
        )

        # 1. Query videos as regular user
        res_user = self.client.get(f"/api/videos?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_user.status_code, 200)
        user_videos = res_user.json()
        # Should only see their own video (or public ones, but clean setup ensures only their video exists)
        self.assertEqual(len(user_videos), 1)
        self.assertEqual(user_videos[0]["id"], video_user_id)

        # 2. Query videos as admin
        res_admin = self.client.get(f"/api/videos?owner_email={self.test_email_admin}&role=admin")
        self.assertEqual(res_admin.status_code, 200)
        admin_videos = res_admin.json()
        # Should see both user and admin videos
        admin_video_ids = [v["id"] for v in admin_videos]
        self.assertIn(video_user_id, admin_video_ids)
        self.assertIn(video_admin_id, admin_video_ids)

        # 3. Regular user attempting to get admin's video details (should fail)
        res_get_detail_bad = self.client.get(f"/api/videos/{video_admin_id}?owner_email={self.test_email_user}&role=user")
        self.assertEqual(res_get_detail_bad.status_code, 404)

        # 4. Admin attempting to get regular user's video details (should succeed)
        res_get_detail_good = self.client.get(f"/api/videos/{video_user_id}?owner_email={self.test_email_admin}&role=admin")
        self.assertEqual(res_get_detail_good.status_code, 200)

if __name__ == "__main__":
    unittest.main()
