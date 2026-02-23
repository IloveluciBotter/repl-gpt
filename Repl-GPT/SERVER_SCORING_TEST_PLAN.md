# Server-Side Scoring – Manual Test Plan

## Summary

`POST /api/train-attempts/submit` now computes `scorePct` from DB-backed question `correct_index` values. Client-supplied `correctAnswers` is ignored for scoring, pass/fail, fee settlement, auto-review, and rewards.

---

## Prerequisites

1. **Valid session**: Login with wallet (cookie `sid`)
2. **HIVE access**: Sufficient token balance for the difficulty fee
3. **Valid track + questions**: Get `trackId` and `questionIds` from `GET /api/tracks/:trackId/questions`
4. **Active cycle**: Ensure current cycle exists

---

## Test 1: Forged `correctAnswers` – Score Should NOT Be Affected

**Goal:** Sending forged `correctAnswers` (all correct) while giving wrong `answers` must not increase score.

```bash
# 1. Get real questions for a track
curl -b cookies.txt "https://YOUR_HOST/api/tracks/TRACK_ID/questions?level=1"

# 2. Submit with WRONG answers but forged correctAnswers (all 0)
# If questions have correctIndex [0,1,2,0,1], send answers [1,2,3,1,2] (all wrong)
# and correctAnswers [0,0,0,0,0] (pretending all correct)
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{
    "trackId": "TRACK_ID",
    "difficulty": "low",
    "content": "Test submission",
    "answers": [1, 2, 3, 1, 2],
    "questionIds": ["Q1", "Q2", "Q3", "Q4", "Q5"],
    "correctAnswers": [0, 0, 0, 0, 0]
  }' \
  "https://YOUR_HOST/api/train-attempts/submit"
```

**Expected:**
- `scorePct` is 0 (or low, based on real correct indices)
- `autoReview.decision` is `"rejected"` or `"pending"` depending on real score
- Fee settlement reflects real score, not forged 100%

---

## Test 2: Correct Answers – Score Updates Correctly

**Goal:** Sending correct answers (matching DB `correct_index`) produces high score.

```bash
# Use actual correct indices from DB for each question
# Example: questions have correctIndex [0, 1, 2, 0, 1]
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{
    "trackId": "TRACK_ID",
    "difficulty": "low",
    "content": "Test submission",
    "answers": [0, 1, 2, 0, 1],
    "questionIds": ["Q1", "Q2", "Q3", "Q4", "Q5"]
  }' \
  "https://YOUR_HOST/api/train-attempts/submit"
```

**Expected:**
- `scorePct` ≈ 1.0 (100%)
- `autoReview.decision` is `"approved"`
- Fee refund and rewards reflect high score

---

## Test 3: Validation – answers Without questionIds

```bash
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{
    "trackId": "TRACK_ID",
    "difficulty": "low",
    "content": "Test",
    "answers": [0, 1]
  }' \
  "https://YOUR_HOST/api/train-attempts/submit"
```

**Expected:** 400 with validation error (answers without questionIds).

---

## Test 4: Invalid questionIds

```bash
# Use non-existent question IDs
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{
    "trackId": "TRACK_ID",
    "difficulty": "low",
    "content": "Test",
    "answers": [0],
    "questionIds": ["nonexistent-uuid"]
  }' \
  "https://YOUR_HOST/api/train-attempts/submit"
```

**Expected:** 400 with `{ "error": "invalid_question_ids", "message": "One or more question IDs not found" }`.

---

## Test 5: No answers – scorePct Stays 0

```bash
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{
    "trackId": "TRACK_ID",
    "difficulty": "low",
    "content": "Test without answers"
  }' \
  "https://YOUR_HOST/api/train-attempts/submit"
```

**Expected:**
- `scorePct` = 0
- No answer events logged
- Fee/review based on 0% score
