import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

import src.database as db
db.init_db()

videos = db.list_videos("sss@gmail.com", "admin")
print("Total videos from DB:", len(videos))
if len(videos) > 0:
    print("Raw DB video keys and values:")
    for k, v in videos[0].items():
        print(f"  {k}: {type(v)} = {v}")
