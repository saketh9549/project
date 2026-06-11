import os
import requests
from pymongo import MongoClient
from bson.objectid import ObjectId

video_path = r"C:\Users\Lenovo\Downloads\If you're a lazy but ambitious student, please watch this video. [G0VyJFJw6mY].webm"
upload_url = "http://localhost:8000/api/upload"
mongodb_uri = "mongodb://127.0.0.1:27017/summarix_test"

def run_upload_and_verify():
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at: {video_path}")
        return

    file_size = os.path.getsize(video_path)
    print(f"Found file at path. Size: {file_size} bytes. Starting upload to server...")

    # Upload using streaming POST request
    params = {
        "filename": os.path.basename(video_path),
        "owner_email": "user@summarix.io"
    }
    
    with open(video_path, 'rb') as f:
        response = requests.post(upload_url, params=params, data=f, headers={"Content-Type": "application/octet-stream"})

    if response.status_code != 200:
        print(f"Upload failed with status code {response.status_code}: {response.text}")
        return

    res_data = response.json()
    print("Upload Response:", res_data)
    
    grid_fs_id = res_data.get("grid_fs_id")
    if not grid_fs_id:
        print("Error: No grid_fs_id returned from server upload endpoint.")
        return

    # Verify directly in MongoDB
    print(f"Connecting to MongoDB at {mongodb_uri} to verify GridFS storage...")
    client = MongoClient(mongodb_uri)
    db = client.get_database()
    
    # Check fs.files for grid_fs_id
    fs_file = db["fs.files"].find_one({"_id": ObjectId(grid_fs_id)})
    if fs_file:
        print("Success! Verified file metadata in db['fs.files']:")
        print(f" - ID: {fs_file['_id']}")
        print(f" - Filename: {fs_file['filename']}")
        print(f" - Length: {fs_file['length']} bytes")
        print(f" - Upload Date: {fs_file['uploadDate']}")
        
        # Count chunks in fs.chunks
        chunks_count = db["fs.chunks"].count_documents({"files_id": ObjectId(grid_fs_id)})
        print(f" - Chunks found in db['fs.chunks']: {chunks_count}")
    else:
        print(f"Failure! Could not find GridFS file record with ID {grid_fs_id} in MongoDB.")

if __name__ == "__main__":
    run_upload_and_verify()
