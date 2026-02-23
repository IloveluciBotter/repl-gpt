# App-Level Admin Access - Manual Test Plan

## Prerequisites

1. Set env: `BOOTSTRAP_ADMIN_KEY` (long random string, e.g. 64 chars). Example: `openssl rand -hex 32`
2. Server running with `DATABASE_URL` set
3. Solana wallet (Phantom) for auth

## Test Flow

### 1. Normal user cannot access admin endpoints

```bash
# Login first (get session cookie via browser or API)
# Then without valid session:
curl -i https://YOUR_HOST/api/admin/users
# Expect: 401 Unauthorized

# With valid session but non-admin user:
curl -i -b "sid=YOUR_SESSION_COOKIE" https://YOUR_HOST/api/admin/users
# Expect: 403 Admin access required
```

### 2. Bootstrap creates first admin

```bash
# 1. Login with wallet (POST /api/auth/verify) - get sid cookie
# 2. Bootstrap:
curl -X POST -b "sid=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"key":"YOUR_BOOTSTRAP_ADMIN_KEY"}' \
  https://YOUR_HOST/api/admin/bootstrap
# Expect: 200 { "success": true, "user": { "id": "...", "isAdmin": true } }

# 3. Verify bootstrap disabled after first admin:
curl -X POST -b "sid=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"key":"YOUR_BOOTSTRAP_ADMIN_KEY"}' \
  https://YOUR_HOST/api/admin/bootstrap
# Expect: 403 "Bootstrap disabled - admin already exists"
```

### 3. Admin can promote another user

```bash
# As admin, promote user by id (user id = wallet address for wallet users):
curl -X POST -b "sid=ADMIN_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' \
  https://YOUR_HOST/api/admin/users/WALLET_ADDRESS_OF_OTHER_USER/role
# Expect: 200 { "id": "...", "isAdmin": true, ... }

# Demote:
curl -X POST -b "sid=ADMIN_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"role":"user"}' \
  https://YOUR_HOST/api/admin/users/WALLET_ADDRESS/role
# Expect: 200 with isAdmin: false
```

### 4. Admin can do corpus/tracks management

```bash
# List users
curl -b "sid=ADMIN_SESSION" https://YOUR_HOST/api/admin/users?search=
curl -b "sid=ADMIN_SESSION" https://YOUR_HOST/api/admin/users?search=abc

# Corpus (requires admin, not CREATOR_PUBLIC_KEY)
curl -b "sid=ADMIN_SESSION" https://YOUR_HOST/api/corpus/embed-status
# Tracks, cycle rollover, etc. - all use requireAdmin
```

### 5. /api/me indicates admin

```bash
curl -b "sid=ADMIN_SESSION" https://YOUR_HOST/api/me
# Expect: { "id": "...", "username": "...", "isAdmin": true, "isReviewer": false, "isHubPoster": false }
```

## Full login + bootstrap sequence (for scripting)

```bash
# 1. Get nonce
NONCE_RESP=$(curl -s "https://YOUR_HOST/api/auth/nonce?wallet=YOUR_WALLET_ADDRESS")
# Parse nonce, message from JSON. Sign message with wallet.

# 2. Verify (sign message with Phantom, get base64 signature)
curl -c cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"wallet":"YOUR_WALLET","signature":"BASE64_SIG","nonce":"NONCE"}' \
  https://YOUR_HOST/api/auth/verify

# 3. Bootstrap
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"key":"BOOTSTRAP_ADMIN_KEY"}' \
  https://YOUR_HOST/api/admin/bootstrap
```
