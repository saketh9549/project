import os
from pymongo import MongoClient

uri = "mongodb+srv://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"
try:
    print("Connecting to MongoDB Atlas with new credentials...")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db = client.get_default_database()
    print("Database name:", db.name)
    print("Collections:", db.list_collection_names())
except Exception as e:
    print("Connection failed:", e)
