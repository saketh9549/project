from pymongo import MongoClient
from bson.objectid import ObjectId

grid_fs_id = "6a2a62058843831210e9a55c"
mongodb_uri = "mongodb+srv://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"

def run_verify():
    print(f"Connecting to MongoDB Atlas cloud to verify GridFS storage of file ID: {grid_fs_id}...")
    try:
        client = MongoClient(mongodb_uri)
        db = client.get_database("summarix_test")
        
        # Check fs.files for grid_fs_id
        fs_file = db["fs.files"].find_one({"_id": ObjectId(grid_fs_id)})
        if fs_file:
            print("Success! Verified file metadata in MongoDB Atlas cloud db['fs.files']:")
            print(f" - ID: {fs_file['_id']}")
            print(f" - Filename: {fs_file['filename']}")
            print(f" - Length: {fs_file['length']} bytes")
            print(f" - Upload Date: {fs_file['uploadDate']}")
            
            # Count chunks in fs.chunks
            chunks_count = db["fs.chunks"].count_documents({"files_id": ObjectId(grid_fs_id)})
            print(f" - Chunks found in cloud db['fs.chunks']: {chunks_count}")
        else:
            print(f"Failure! Could not find GridFS file record with ID {grid_fs_id} in MongoDB Atlas cloud.")
    except Exception as e:
        print("Verification failed due to error:", e)

if __name__ == "__main__":
    run_verify()
