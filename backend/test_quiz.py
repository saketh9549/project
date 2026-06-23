import os
import json
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

    def tearDown(self):
        # Clean up
        self.db.playlists.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.catalogs.delete_many({"ownerEmail": {"$in": [self.admin_email, self.user_email]}})
        self.db.quizzes.delete_many({"createdBy": {"$in": [self.admin_email, self.user_email]}})

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

