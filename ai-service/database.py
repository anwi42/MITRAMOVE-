import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")

_client = None
_db = None


def get_db():
    """Lazily create and cache the MongoDB connection."""
    global _client, _db

    if _db is None:
        if not MONGODB_URI:
            raise RuntimeError("MONGODB_URI is not set")

        _client = MongoClient(MONGODB_URI)
        _db = _client.get_default_database()

    return _db
