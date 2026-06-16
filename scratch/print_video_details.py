import os
import sys
from pymongo import MongoClient

uri = "mongodb+srv://sakethgudapati_db_user:AikyKUkMrVx0rA0s@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"
client = MongoClient(uri)
db = client.get_default_database()

for v in db["catalogs"].find():
    print(f"Video ID: {v['_id']}")
    print(f"  fileName: {v.get('fileName')}")
    print(f"  duration: {v.get('duration')}")
    print(f"  uploadStatus: {v.get('uploadStatus')}")
    blocks = list(db["indices"].find({"catalogId": v["_id"]}).sort("startTime", 1))
    print(f"  Total blocks: {len(blocks)}")
    for b in blocks:
        print(f"    - [{b.get('startTime')} -> {b.get('endTime')}]: {b.get('topicTitle')}")
    print("-" * 50)
