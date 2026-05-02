import json
import urllib.request

BASE = 'http://127.0.0.1:8000'

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

try:
    print('Signing up admin...')
    r = post('/auth/signup', {'username': 'ui_admin_auto', 'password': 'adminpass', 'role': 'admin'})
    print(json.dumps(r, indent=2))
except Exception as e:
    print('Signup error:', e)

try:
    print('\nLogging in admin...')
    r = post('/auth/login', {'username': 'ui_admin_auto', 'password': 'adminpass'})
    print(json.dumps(r, indent=2))
    token = r.get('access_token')
    if token:
        req = urllib.request.Request(BASE + '/auth/users', headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(req) as resp:
            users = json.load(resp)
            print('\nUsers:')
            print(json.dumps(users, indent=2))
except Exception as e:
    print('Login/list error:', e)
