import os
import time
import requests
from pymongo import MongoClient
from bson.objectid import ObjectId

video_path = r"C:\Users\Lenovo\Downloads\ytvid.mp4"
upload_url = "http://localhost:8000/api/upload"
index_url = "http://localhost:8000/api/index"
videos_list_url = "http://localhost:8000/api/videos"
mongodb_uri = "mongodb://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"

def run_pipeline():
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at: {video_path}")
        return

    file_size = os.path.getsize(video_path)
    print(f"Found file to upload: {video_path} ({file_size} bytes)")

    # 1. Upload to GridFS via API server
    print("1. Uploading video to server...")
    params = {
        "filename": os.path.basename(video_path),
        "owner_email": "user@summarix.io"
    }
    with open(video_path, 'rb') as f:
        up_resp = requests.post(upload_url, params=params, data=f, headers={"Content-Type": "application/octet-stream"})

    if up_resp.status_code != 200:
        print(f"Upload failed: {up_resp.status_code} - {up_resp.text}")
        return

    up_data = up_resp.json()
    grid_fs_id = up_data["grid_fs_id"]
    print(f"Upload completed. grid_fs_id: {grid_fs_id}")

    # 2. Trigger Indexing Pipeline (runs Whisper + Gemini semantic boundary analysis + summary)
    print("\n2. Triggering indexing pipeline (this may take a moment)...")
    idx_payload = {
        "grid_fs_id": grid_fs_id,
        "language": "en",
        "owner_email": "user@summarix.io"
    }
    start_time = time.time()
    idx_resp = requests.post(index_url, json=idx_payload)
    elapsed = time.time() - start_time

    if idx_resp.status_code != 200:
        print(f"Indexing failed: {idx_resp.status_code} - {idx_resp.text}")
        return

    idx_data = idx_resp.json()
    video_id = idx_data["video_id"]
    print(f"Indexing completed successfully in {elapsed:.2f}s. Indexed video_id: {video_id}")

    # 3. Retrieve Catalog from server endpoint
    print("\n3. Fetching updated catalogs list from GET /api/videos...")
    list_params = {"owner_email": "user@summarix.io"}
    list_resp = requests.get(videos_list_url, params=list_params)

    if list_resp.status_code != 200:
        print(f"Failed to fetch videos catalog list: {list_resp.status_code} - {list_resp.text}")
        return

    videos = list_resp.json()
    print(f"Server returned {len(videos)} videos in the catalog.")

    # Match our video ID in the catalog list
    matched = next((v for v in videos if v["id"] == video_id), None)
    if matched:
        print("\nSuccess! Newly uploaded video is present in the catalogs collection:")
        print(f" - Catalog ID  : {matched['id']}")
        print(f" - Filename    : {matched['file_name']}")
        print(f" - File Path   : {matched['file_path']}")
        print(f" - Local Path  : '{matched.get('absolute_local_path', '')}' (should be empty for GridFS)")
        print(f" - Duration    : {matched['duration']}s ({matched['duration_str']})")
        print(f" - Created At  : {matched['created_at']}")
        print(f" - Chapters    : {len(matched.get('timeline_index', []))}")
    else:
        print(f"\nFailure! Could not find video ID {video_id} in the returned catalogs list.")

    # 4. Directly query MongoDB Atlas to verify no absoluteLocalPath is saved
    print("\n4. Verifying document fields directly in MongoDB Atlas cloud...")
    client = MongoClient(mongodb_uri)
    db = client.get_database("summarix_test")
    doc = db["catalogs"].find_one({"_id": ObjectId(video_id)})
    if doc:
        print("MongoDB Atlas Document Details:")
        print(f" - _id              : {doc['_id']}")
        print(f" - fileName         : {doc.get('fileName')}")
        print(f" - absoluteLocalPath: '{doc.get('absoluteLocalPath')}' (Verified Empty: {doc.get('absoluteLocalPath') == ''})")
        print(f" - gridFsFileId     : {doc.get('gridFsFileId')}")
    else:
        print("Could not find the document in MongoDB Atlas.")

if __name__ == "__main__":
    run_pipeline()
