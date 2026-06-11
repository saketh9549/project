from pymongo import MongoClient

mongodb_uri = "mongodb+srv://sakethgudapati_db_user:RhvJWU6vImT5kdqS@summarixcluster1.jy7q5kl.mongodb.net/summarix_test"

def format_bytes(size_in_bytes):
    # Formatter for bytes to KB/MB
    if size_in_bytes < 1024:
        return f"{size_in_bytes} B"
    elif size_in_bytes < 1024 * 1024:
        return f"{size_in_bytes / 1024:.2f} KB"
    else:
        return f"{size_in_bytes / (1024 * 1024):.2f} MB"

def run_stats():
    print("Connecting to MongoDB Atlas to fetch database statistics...")
    try:
        client = MongoClient(mongodb_uri)
        db = client.get_database("summarix_test")
        
        # 1. Database-level stats
        stats = db.command("dbStats")
        print("\n=== Global Database Stats (summarix_test) ===")
        print(f"Collections count : {stats.get('collections', 0)}")
        print(f"Total Objects (docs): {stats.get('objects', 0)}")
        print(f"Data Size (Uncompressed): {format_bytes(stats.get('dataSize', 0))}")
        print(f"Storage Size (Allocated on Disk): {format_bytes(stats.get('storageSize', 0))}")
        print(f"Index Size        : {format_bytes(stats.get('indexSize', 0))}")
        
        # 2. Collection-level stats
        collections = ["catalogs", "indices", "summaries", "fs.files", "fs.chunks"]
        print("\n=== Collection-Level Storage Details ===")
        for col_name in collections:
            try:
                col_stats = db.command("collStats", col_name)
                count = col_stats.get("count", 0)
                size = col_stats.get("size", 0)
                storage_size = col_stats.get("storageSize", 0)
                index_size = col_stats.get("totalIndexSize", 0)
                
                print(f"Collection: '{col_name}'")
                print(f"  - Document Count: {count}")
                print(f"  - Data Size     : {format_bytes(size)}")
                print(f"  - Storage Size  : {format_bytes(storage_size)}")
                print(f"  - Index Size    : {format_bytes(index_size)}")
            except Exception as e:
                print(f"Collection: '{col_name}' - failed to get stats: {e}")
                
    except Exception as e:
        print("Failed to fetch database statistics:", e)

if __name__ == "__main__":
    run_stats()
