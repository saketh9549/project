import os
import json
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

class TestQuiz(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = db.get_db()
        self.admin_email = "quiz_admin@summarix.io"
        self.user_email = "quiz_user@summarix.io"
        
        # Clean up database
        self.db.playlists.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.quizzes.delete_many({"createdBy": {"$in": [self.admin_email, self.user_email]}})
        self.db.quiz_attempts.delete_many({"userEmail": {"$in": [self.admin_email, self.user_email]}})

    def tearDown(self):
        # Clean up
        self.db.playlists.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.quizzes.delete_many({"createdBy": {"$in": [self.admin_email, self.user_email]}})
        self.db.quiz_attempts.delete_many({"userEmail": {"$in": [self.admin_email, self.user_email]}})

    def test_database_crud(self):
        # 1. Create a dummy catalog video
        video_id = str(ObjectId())
        self.db.catalogs.insert_one({
            "_id": ObjectId(video_id),
            "filePath": "test_video.mp4",
            "ownerEmail": self.admin_email,
            "createdAt": db.datetime.now()
        })

        questions = [
            {
                "questionText": "What is Python?",
                "options": ["A snake", "A programming language", "A coffee brand", "An operating system"],
                "correctAnswerIdx": 1,
                "explanation": "Python is indeed a popular programming language."
            }
        ]

        # 2. Save quiz
        quiz_id = db.save_quiz(
            title="Python Quiz",
            created_by=self.admin_email,
            catalog_id=video_id,
            questions=questions
        )
        self.assertIsNotNone(quiz_id)

        # 3. Get quiz by video
        quiz = db.get_quiz_by_target(catalog_id=video_id)
        self.assertIsNotNone(quiz)
        self.assertEqual(quiz["title"], "Python Quiz")
        self.assertEqual(quiz["createdBy"], self.admin_email)
        self.assertEqual(len(quiz["questions"]), 1)
        self.assertEqual(quiz["questions"][0]["questionText"], "What is Python?")

        # 4. Delete quiz
        deleted = db.delete_quiz(quiz_id)
        self.assertTrue(deleted)

        # 5. Verify deleted
        quiz_post_delete = db.get_quiz_by_target(catalog_id=video_id)
        self.assertIsNone(quiz_post_delete)

    def test_cascading_deletion_video(self):
        # Create video
        video_id = str(ObjectId())
        self.db.catalogs.insert_one({
            "_id": ObjectId(video_id),
            "filePath": "cascade_test_video.mp4",
            "ownerEmail": self.admin_email,
            "createdAt": db.datetime.now()
        })

        # Save quiz for video
        db.save_quiz(
            title="Video Quiz",
            created_by=self.admin_email,
            catalog_id=video_id,
            questions=[{"questionText": "Q1", "options": ["A", "B"], "correctAnswerIdx": 0}]
        )

        # Delete video - should cascade to delete the quiz
        success = db.delete_video(video_id, self.admin_email, "admin")
        self.assertTrue(success)

        # Verify quiz is gone
        quiz = db.get_quiz_by_target(catalog_id=video_id)
        self.assertIsNone(quiz)

    def test_cascading_deletion_playlist(self):
        # Create playlist
        playlist = db.create_playlist("React series", self.admin_email)
        playlist_id = playlist["id"]

        # Save quiz for playlist
        db.save_quiz(
            title="Playlist Quiz",
            created_by=self.admin_email,
            playlist_id=playlist_id,
            questions=[{"questionText": "Q1", "options": ["A", "B"], "correctAnswerIdx": 1}]
        )

        # Delete playlist - should cascade to delete the playlist quiz
        success = db.delete_playlist(playlist_id, self.admin_email, "admin")
        self.assertTrue(success)

        # Verify quiz is gone
        quiz = db.get_quiz_by_target(playlist_id=playlist_id)
        self.assertIsNone(quiz)

    def test_api_endpoints_and_grading(self):
        # Create a video first
        video_id = str(ObjectId())
        self.db.catalogs.insert_one({
            "_id": ObjectId(video_id),
            "filePath": "api_test_video.mp4",
            "ownerEmail": self.admin_email,
            "createdAt": db.datetime.now()
        })

        questions = [
            {
                "questionText": "1 + 1 = ?",
                "options": ["1", "2", "3"],
                "correctAnswerIdx": 1,
                "explanation": "Simple arithmetic: 1 + 1 equals 2."
            },
            {
                "questionText": "What is the capital of France?",
                "options": ["London", "Berlin", "Paris"],
                "correctAnswerIdx": 2,
                "explanation": "Paris is the capital of France."
            }
        ]

        # 1. Post quiz as non-admin -> forbidden
        response = self.client.post(
            f"/api/quizzes?owner_email={self.user_email}&role=user",
            json={
                "title": "Forbidden Quiz",
                "catalogId": video_id,
                "questions": questions
            }
        )
        self.assertEqual(response.status_code, 403)

        # 2. Post quiz as admin -> success
        response = self.client.post(
            f"/api/quizzes?owner_email={self.admin_email}&role=admin",
            json={
                "title": "Math & Trivia Quiz",
                "catalogId": video_id,
                "questions": questions
            }
        )
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        self.assertTrue(res_json["success"])
        quiz_id = res_json["quiz_id"]

        # 3. Get quiz by video_id
        response = self.client.get(f"/api/quizzes?video_id={video_id}")
        self.assertEqual(response.status_code, 200)
        quiz_data = response.json()
        self.assertEqual(quiz_data["title"], "Math & Trivia Quiz")
        self.assertEqual(len(quiz_data["questions"]), 2)

        # 4. Submit answers for grading
        # Correct answer for 1st is 1, correct for 2nd is 2.
        # Let's submit: Question 0 -> 1 (correct), Question 1 -> 0 (incorrect)
        submit_payload = {
            "quizId": quiz_id,
            "answers": [
                {"questionIdx": 0, "selectedOptionIdx": 1},
                {"questionIdx": 1, "selectedOptionIdx": 0}
            ]
        }
        response = self.client.post("/api/quizzes/submit", json=submit_payload)
        self.assertEqual(response.status_code, 200)
        grade_res = response.json()
        self.assertEqual(grade_res["score"], 50.0)
        self.assertEqual(grade_res["correctCount"], 1)
        self.assertEqual(grade_res["totalCount"], 2)
        
        # Verify details
        results = grade_res["results"]
        self.assertEqual(len(results), 2)
        
        self.assertEqual(results[0]["questionIdx"], 0)
        self.assertTrue(results[0]["isCorrect"])
        self.assertEqual(results[0]["explanation"], "Simple arithmetic: 1 + 1 equals 2.")
        
        self.assertEqual(results[1]["questionIdx"], 1)
        self.assertFalse(results[1]["isCorrect"])
        self.assertEqual(results[1]["explanation"], "Paris is the capital of France.")

    def test_quiz_upload_json(self):
        # Create a video first
        video_id = str(ObjectId())
        self.db.catalogs.insert_one({
            "_id": ObjectId(video_id),
            "filePath": "upload_test_video.mp4",
            "ownerEmail": self.admin_email,
            "createdAt": db.datetime.now()
        })

        # Structured JSON file to upload
        quiz_data = {
            "title": "Uploaded Math Quiz",
            "questions": [
                {
                    "questionText": "What is 2 + 2?",
                    "options": ["3", "4", "5", "6"],
                    "correctAnswerIdx": 1,
                    "explanation": "2 + 2 = 4"
                }
            ]
        }
        json_bytes = json.dumps(quiz_data).encode("utf-8")

        # Post quiz file
        response = self.client.post(
            f"/api/quizzes/upload?catalog_id={video_id}&owner_email={self.admin_email}&role=admin",
            files={"file": ("quiz.json", json_bytes, "application/json")}
        )
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        self.assertTrue(res_json["success"])
        self.assertEqual(res_json["title"], "Uploaded Math Quiz")
        self.assertEqual(len(res_json["questions"]), 1)
        self.assertEqual(res_json["questions"][0]["questionText"], "What is 2 + 2?")

        # Try posting as regular user -> forbidden
        response = self.client.post(
            f"/api/quizzes/upload?catalog_id={video_id}&owner_email={self.user_email}&role=user",
            files={"file": ("quiz.json", json_bytes, "application/json")}
        )
        self.assertEqual(response.status_code, 403)

    def test_quiz_attempts_and_analytics(self):
        # 1. Create a dummy quiz
        video_id = str(ObjectId())
        self.db.catalogs.insert_one({
            "_id": ObjectId(video_id),
            "filePath": "analytics_test_video.mp4",
            "ownerEmail": self.admin_email,
            "createdAt": db.datetime.now()
        })
        
        quiz_id = db.save_quiz(
            title="Analytics Math Quiz",
            created_by=self.admin_email,
            catalog_id=video_id,
            questions=[{"questionText": "What is 1+1?", "options": ["1", "2"], "correctAnswerIdx": 1}]
        )
        
        # Create a user record so username lookup works
        self.db.users.delete_many({"email": self.user_email})
        self.db.users.insert_one({
            "email": self.user_email,
            "username": "TestStudent",
            "role": "user",
            "createdAt": db.datetime.now()
        })

        # 2. Submit a quiz attempt from student
        submit_payload = {
            "quizId": quiz_id,
            "answers": [{"questionIdx": 0, "selectedOptionIdx": 1}] # Correct answer
        }
        response = self.client.post(
            f"/api/quizzes/submit?owner_email={self.user_email}&role=user",
            json=submit_payload
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 100.0)

        # 3. Retrieve analytics as student -> forbidden
        response = self.client.get(f"/api/quizzes/analytics?owner_email={self.user_email}&role=user")
        self.assertEqual(response.status_code, 403)

        # 4. Retrieve analytics as admin -> success
        response = self.client.get(f"/api/quizzes/analytics?owner_email={self.admin_email}&role=admin")
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn("attempts", data)
        self.assertIn("stats", data)
        
        # Filter to isolate this test's attempt
        attempts = [a for a in data["attempts"] if a["userEmail"] == self.user_email]
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["userEmail"], self.user_email)
        self.assertEqual(attempts[0]["username"], "TestStudent")
        self.assertEqual(attempts[0]["score"], 100.0)
        self.assertEqual(attempts[0]["quizTitle"], "Analytics Math Quiz")
        
        stats = data["stats"]
        self.assertTrue(stats["totalAttempts"] >= 1)
        
        # Verify the course grouping for our specific quiz title
        self.assertIn("courses", data)
        courses = data["courses"]
        found_quiz = False
        for c in courses:
            for q in c["quizzes"]:
                if q["quizTitle"] == "Analytics Math Quiz":
                    self.assertEqual(q["attemptsCount"], 1)
                    self.assertEqual(q["averageScore"], 100.0)
                    found_quiz = True
                    break
        self.assertTrue(found_quiz, "Should find the math quiz inside courses list")

        # Clean up test user
        self.db.users.delete_many({"email": self.user_email})


