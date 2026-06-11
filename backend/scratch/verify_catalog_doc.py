from pymongo import MongoClient
from bson.objectid import ObjectId

video_id = "87e67871786e1e20a647ed08"
mongodb_uri = "mongodb+srv://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"

def run_verify():
    print(f"Connecting to MongoDB Atlas cloud to inspect catalogs document: {video_id}...")
    try:
        client = MongoClient(mongodb_uri)
        db = client.get_database("summarix_test")
        doc = db["catalogs"].find_one({"_id": ObjectId(video_id)})
        if doc:
            print("\nVerified MongoDB Atlas Cloud Document Details:")
            print(f" - _id              : {doc['_id']}")
            print(f" - fileName         : {doc.get('fileName')}")
            print(f" - filePath         : {doc.get('filePath')}")
            print(f" - absoluteLocalPath: '{doc.get('absoluteLocalPath')}' (Verified Empty: {doc.get('absoluteLocalPath') == ''})")
            print(f" - gridFsFileId     : {doc.get('gridFsFileId')}")
            print(f" - uploadStatus     : {doc.get('uploadStatus')}")
            print(f" - duration         : {doc.get('duration')}s")
            print(f" - timelineIndex size: {len(doc.get('timelineIndex', []))}")
        else:
            print("Could not find the document in MongoDB Atlas cloud.")
    except Exception as e:
        print("Verification failed due to error:", e)

if __name__ == "__main__":
    run_verify()
