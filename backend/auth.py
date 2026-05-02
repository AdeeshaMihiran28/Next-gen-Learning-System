

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
