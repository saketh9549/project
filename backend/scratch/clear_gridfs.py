from pymongo import MongoClient

mongodb_uri = "mongodb+srv://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"

def clear_gridfs():
    print("Connecting to MongoDB Atlas to clear GridFS collections...")
    try:
        client = MongoClient(mongodb_uri)
        db = client.get_database("summarix_test")
        
        # Count before deletion
        files_before = db["fs.files"].count_documents({})
        chunks_before = db["fs.chunks"].count_documents({})
        print(f"Current documents before clearing:")
        print(f" - fs.files: {files_before}")
        print(f" - fs.chunks: {chunks_before}")
        
        # Clear collections
        print("Clearing fs.files and fs.chunks collections...")
        res_files = db["fs.files"].delete_many({})
        res_chunks = db["fs.chunks"].delete_many({})
        
        print(f"Deletion Results:")
        print(f" - Deleted from fs.files: {res_files.deleted_count}")
        print(f" - Deleted from fs.chunks: {res_chunks.deleted_count}")
        
        # Double check remaining
        files_after = db["fs.files"].count_documents({})
        chunks_after = db["fs.chunks"].count_documents({})
        print(f"Current documents after clearing:")
        print(f" - fs.files: {files_after}")
        print(f" - fs.chunks: {chunks_after}")
        
    except Exception as e:
        print("Failed to clear GridFS data:", e)

if __name__ == "__main__":
    clear_gridfs()
