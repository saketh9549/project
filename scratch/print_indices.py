import os
import sys
from pymongo import MongoClient

uri = "mongodb+srv://sakethgudapati_db_user:AikyKUkMrVx0rA0s@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"
client = MongoClient(uri)
db = client.get_default_database()

print("Videos in database:")
for v in db["catalogs"].find():
    print(f"Video ID: {v['_id']}, Name: {v.get('fileName')}")
    blocks = list(db["indices"].find({"catalogId": v["_id"]}).sort("startTime", 1))
    print(f"Total blocks/chapters: {len(blocks)}")
    for idx, b in enumerate(blocks, start=1):
        print(f"  Block {idx}: startTime={b.get('startTime')}, topicTitle='{b.get('topicTitle')}'")
        print(f"    Summary preview: {b.get('text')[:60]}...")
