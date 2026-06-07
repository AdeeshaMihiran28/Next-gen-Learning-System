from pathlib import Path
import sys
import json
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import main

client = TestClient(main.app)


def signup(user, pwd, role):
    resp = client.post("/auth/signup", json={"username": user, "password": pwd, "role": role})
    print("signup", user, resp.status_code)
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)
    return resp


def login(user, pwd):
    resp = client.post("/auth/login", json={"username": user, "password": pwd})
    print("login", user, resp.status_code)
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)
    return resp


if __name__ == '__main__':
    # create test users (ok if they already exist)
    signup("e2e_user", "secret123", "student")
    signup("e2e_admin", "secret123", "admin")

    # login as admin and fetch user list
    r = login("e2e_admin", "secret123")
    token = None
    try:
        token = r.json().get("access_token")
    except Exception:
        token = None

    if token:
        headers = {"Authorization": f"Bearer {token}"}
        ru = client.get("/auth/users", headers=headers)
        print("users status", ru.status_code)
        try:
            print(json.dumps(ru.json(), indent=2))
        except Exception:
            print(ru.text)
    else:
        print("Admin login failed; no token returned")

    # login as student
    login("e2e_user", "secret123")

    # test /auth/me for admin token
    if token:
        rm = client.get("/auth/me", headers=headers)
        print("me", rm.status_code)
        try:
            print(json.dumps(rm.json(), indent=2))
        except Exception:
            print(rm.text)
