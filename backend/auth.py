"""
Authentication module with optional MongoDB backend (motor) and SQLite fallback.

Behavior:
- If `config.MONGO_URI` is set and reachable, the module will use MongoDB via
  `motor.motor_asyncio.AsyncIOMotorClient` and store users in the `users` collection.
- If MongoDB is not available, it falls back to a local SQLite file `users.db`.

Endpoints provided: `/auth/signup`, `/auth/login`, `/auth/me`, `/auth/users`.
"""
import asyncio
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from passlib.context import CryptContext
from jose import JWTError, jwt

import logging

from config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    MONGO_URI,
    MONGO_DB,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")
security = HTTPBearer()

# Runtime DB backend selection
using_mongo = False
mongo_client = None
users_coll = None

# SQLite fallback settings
DB_FILE = "users.db"


def _get_sqlite_conn():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_sqlite():
    conn = _get_sqlite_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


async def init_db_async():
    """Initialize DB backend. If Mongo is configured, try to connect and create index.
    Otherwise ensure SQLite tables exist.
    """
    global using_mongo, mongo_client, users_coll

    if MONGO_URI:
        try:
            # Lazy import motor to avoid hard dependency at import-time errors
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_client = AsyncIOMotorClient(MONGO_URI)
            # Choose DB name; if MONGO_URI contains a DB this will still work
            db = mongo_client[MONGO_DB] if MONGO_DB else mongo_client.get_default_database()
            users_coll = db["users"]

            # Test connection
            await mongo_client.admin.command("ping")

            # Ensure unique index on username
            await users_coll.create_index("username", unique=True)
            using_mongo = True
            logger.info("Using MongoDB for auth (users collection)")
            return
        except Exception as ex:
            logger.warning(f"MongoDB init failed, falling back to SQLite: {ex}")
            using_mongo = False

    # Fallback: ensure sqlite DB exists
    _init_sqlite()
    using_mongo = False


class UserCreate(BaseModel):
    username: str
    password: str
    role: Optional[str] = "student"


async def get_user_by_username(username: str):
    """Return user dict or None. Fields: id, username, hashed_password, role"""
    if using_mongo and users_coll is not None:
        doc = await users_coll.find_one({"username": username})
        if not doc:
            return None
        return {"id": str(doc.get("_id")), "username": doc.get("username"), "hashed_password": doc.get("hashed_password"), "role": doc.get("role", "student")}

    # SQLite path (run in thread)
    def _get():
        conn = _get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, username, hashed_password, role FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        return {"id": row["id"], "username": row["username"], "hashed_password": row["hashed_password"], "role": row["role"]}

    return await asyncio.to_thread(_get)


async def create_user(username: str, password: str, role: str = "student"):
    if using_mongo and users_coll is not None:
        hashed = pwd_context.hash(password)
        try:
            res = await users_coll.insert_one({"username": username, "hashed_password": hashed, "role": role})
            return {"id": str(res.inserted_id), "username": username, "role": role}
        except Exception as ex:
            # Duplicate key error
            try:
                from pymongo.errors import DuplicateKeyError
                if isinstance(ex, DuplicateKeyError):
                    raise ValueError("User already exists")
            except Exception:
                pass
            raise

    # SQLite path
    def _create():
        conn = _get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cur.fetchone():
            conn.close()
            raise ValueError("User already exists")
        hashed = pwd_context.hash(password)
        cur.execute("INSERT INTO users (username, hashed_password, role) VALUES (?, ?, ?)", (username, hashed, role))
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
        return {"id": user_id, "username": username, "role": role}

    return await asyncio.to_thread(_create)


async def authenticate_user(username: str, password: str):
    user = await get_user_by_username(username)
    if not user:
        return None
    if not pwd_context.verify(password, user["hashed_password"]):
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "username" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
    user = await get_user_by_username(payload["username"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.post("/signup")
async def signup(user: UserCreate):
    try:
        created = await create_user(user.username, user.password, user.role or "student")
        return {"success": True, "user": {"username": created["username"], "role": created["role"]}}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Signup failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login")
async def login(payload: dict):
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password required")
    user = await authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    access_token = create_access_token({"username": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "user": {"username": user["username"], "role": user["role"]}}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"user": {"username": current_user["username"], "role": current_user["role"]}}


@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    # Admin-only
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if using_mongo and users_coll is not None:
        cursor = users_coll.find({}, {"username": 1, "role": 1})
        rows = await cursor.to_list(length=1000)
        users = [{"id": str(r.get("_id")), "username": r.get("username"), "role": r.get("role", "student")} for r in rows]
        return {"users": users}

    def _list():
        conn = _get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, username, role FROM users ORDER BY id DESC")
        rows = cur.fetchall()
        conn.close()
        return [{"id": r[0], "username": r[1], "role": r[2]} for r in rows]

    users = await asyncio.to_thread(_list)
    return {"users": users}


import os
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from bson import ObjectId

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from dbconnect import col

router = APIRouter(prefix="/api/auth", tags=["auth"])

pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

def _secret():
    s = os.getenv("JWT_SECRET", "").strip()
    if not s:
        raise RuntimeError("JWT_SECRET missing in .env")
    return s

def create_token(user_id: str, email: str):
    expires_min = int(os.getenv("JWT_EXPIRES_MIN", "4320"))
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_min)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")

def get_current_user(authorization: str = Header(default="")):
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing/invalid Authorization header")

    token = parts[1]
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
        return {"id": payload.get("sub"), "email": payload.get("email")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

class RegisterIn(BaseModel):
    name: str | None = ""
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/register")
def register(body: RegisterIn):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    users = col("users")

    email = body.email.lower().strip()
    if users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    doc = {
        "name": (body.name or "").strip(),
        "email": email,
        "password_hash": pwd_ctx.hash(body.password),
        "created_at": datetime.now(timezone.utc),
    }

    res = users.insert_one(doc)
    token = create_token(str(res.inserted_id), email)

    return {
        "message": "Registered successfully",
        "token": token,
        "user": {"id": str(res.inserted_id), "name": doc["name"], "email": email},
    }

@router.post("/login")
def login(body: LoginIn):
    users = col("users")
    email = body.email.lower().strip()

    user = users.find_one({"email": email})
    if not user or not pwd_ctx.verify(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(str(user["_id"]), user["email"])
    return {
        "message": "Login successful",
        "token": token,
        "user": {"id": str(user["_id"]), "name": user.get("name", ""), "email": user["email"]},
    }

@router.get("/me")
def me(user=Depends(get_current_user)):
    users = col("users")
    try:
        u = users.find_one({"_id": ObjectId(user["id"])}, {"password_hash": 0})
    except:
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user")

    if not u:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "user": {
            "id": str(u["_id"]),
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "created_at": u.get("created_at"),
        }
    }
