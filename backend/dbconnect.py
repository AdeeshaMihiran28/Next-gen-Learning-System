import os
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, ConfigurationError

_client = None
_db = None

def init_db():
    global _client, _db

    mongo_uri = os.getenv("MONGO_URI", "").strip()
    db_name = os.getenv("MONGO_DB_NAME", "ITPM").strip()

    if not mongo_uri:
        raise RuntimeError("MONGO_URI is missing in .env")

    try:
        # ✅ server_api is recommended for Atlas, avoids some handshake issues
        _client = MongoClient(
            mongo_uri,
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=8000
        )
        _client.admin.command("ping")

        _db = _client[db_name]

        # indexes
        _db.users.create_index("email", unique=True)
        return _db

    except ConfigurationError as e:
        raise RuntimeError(
            f"Mongo URI configuration error: {e}\n"
            f"Check your cluster hostname in MONGO_URI.\n"
            f"Example: mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
        )
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        raise RuntimeError(
            f"MongoDB connection failed: {e}\n"
            f"Fixes:\n"
            f" - Atlas: Network Access allow your IP (or 0.0.0.0/0)\n"
            f" - Correct username/password\n"
            f" - Ensure cluster is running (not paused)\n"
        )

def get_db():
    if _db is None:
        raise RuntimeError("DB not initialized. Call init_db() first.")
    return _db

def col(name: str):
    return get_db()[name]
