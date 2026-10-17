from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from database import get_db

router = APIRouter()

SESSIONS_TO_FETCH = 10
MAX_STEPS = 4
DIRECTIONS = ["LEFT", "RIGHT", "UP", "DOWN"]
WEAK_DIRECTION_THRESHOLD = 60
STRONG_DIRECTION_THRESHOLD = 85
SHORTER_SESSION_RATIO = 0.8
MIN_SESSIONS_FOR_DURATION_RULE = 6
MIN_SESSIONS_FOR_DECLINE_RULE = 6
MIN_WEEKLY_SESSIONS = 3
DECLINE_THRESHOLD_PCT = 10
FATIGUE_RATIO_THRESHOLD = 0.5


class ImprovementStep(BaseModel):
    priority: int
    icon: str
    title: str
    description: str
    type: str


class ImprovementPlanResponse(BaseModel):
    steps: List[ImprovementStep]
    generatedAt: datetime
    basedOnSessions: int


def aggregate_direction_accuracy(sessions):
    totals = {d: {"attempts": 0, "hits": 0} for d in DIRECTIONS}

    for session in sessions:
        stats = session.get("directionStats") or {}
        for direction in DIRECTIONS:
            d = stats.get(direction) or {}
            totals[direction]["attempts"] += d.get("attempts", 0) or 0
            totals[direction]["hits"] += d.get("hits", 0) or 0

    accuracies = {}
    for direction in DIRECTIONS:
        attempts = totals[direction]["attempts"]
        hits = totals[direction]["hits"]
        accuracies[direction] = (hits / attempts * 100) if attempts > 0 else None

    return accuracies


def rule_weakest_direction(direction_accuracies) -> Optional[dict]:
    played = {d: acc for d, acc in direction_accuracies.items() if acc is not None}
    if not played:
        return None

    weakest = min(played, key=played.get)
    weakest_acc = played[weakest]

    if weakest_acc < WEAK_DIRECTION_THRESHOLD:
        return {
            "priority": 1,
            "icon": "🎯",
            "title": f"Practice {weakest} direction",
            "description": (
                f"{weakest} accuracy is {weakest_acc:.0f}% — your weakest direction. "
                f"Play 3 Fish Adventure sessions focusing on {weakest} movement."
            ),
            "type": "direction",
        }
    return None


def rule_session_duration(sessions) -> Optional[dict]:
    if len(sessions) < MIN_SESSIONS_FOR_DURATION_RULE:
        return None

    with_accuracy = [
        (s.get("performance", {}).get("accuracy", 0) or 0, s.get("duration", 0) or 0)
        for s in sessions
    ]
    sorted_by_accuracy = sorted(with_accuracy, key=lambda t: t[0], reverse=True)

    top3 = sorted_by_accuracy[:3]
    bottom3 = sorted_by_accuracy[-3:]

    avg_top_duration_sec = mean(d for _, d in top3)
    avg_bottom_duration_sec = mean(d for _, d in bottom3)

    if avg_bottom_duration_sec <= 0:
        return None

    if avg_top_duration_sec < avg_bottom_duration_sec * SHORTER_SESSION_RATIO:
        optimal_duration = max(1, round(avg_top_duration_sec / 60))
        return {
            "priority": 2,
            "icon": "⏱️",
            "title": "Try shorter sessions",
            "description": (
                f"Best performance in {optimal_duration}-minute sessions. "
                f"Try keeping sessions under {optimal_duration} minutes."
            ),
            "type": "duration",
        }
    return None


def rule_session_frequency(sessions) -> Optional[dict]:
    week_ago = datetime.utcnow() - timedelta(days=7)

    count = 0
    for session in sessions:
        created_at = session.get("createdAt")
        if created_at and created_at >= week_ago:
            count += 1

    if count < MIN_WEEKLY_SESSIONS:
        return {
            "priority": 3,
            "icon": "📅",
            "title": "Play more consistently",
            "description": (
                f"Only {count} sessions this week. "
                "Aim for 3-5 sessions per week for best progress."
            ),
            "type": "frequency",
        }
    return None


def rule_ready_for_level_2(sessions, direction_accuracies) -> Optional[dict]:
    played = {d: acc for d, acc in direction_accuracies.items() if acc is not None}
    if not played:
        return None

    strongest = max(played, key=played.get)
    strongest_acc = played[strongest]

    fish_levels = [
        s.get("performance", {}).get("difficultyReached", 1) or 1
        for s in sessions
        if s.get("module") == "fish"
    ]
    max_level = max(fish_levels) if fish_levels else 1

    if strongest_acc > STRONG_DIRECTION_THRESHOLD and max_level < 2:
        return {
            "priority": 4,
            "icon": "🌟",
            "title": "Ready for Level 2",
            "description": (
                f"{strongest} direction accuracy is {strongest_acc:.0f}%. "
                "Try Fish Adventure Level 2!"
            ),
            "type": "level_up",
        }
    return None


def rule_accuracy_declining(sessions) -> Optional[dict]:
    if len(sessions) < MIN_SESSIONS_FOR_DECLINE_RULE:
        return None

    last_three = sessions[-3:]
    previous_three = sessions[-6:-3]

    last_avg = mean(s.get("performance", {}).get("accuracy", 0) or 0 for s in last_three)
    previous_avg = mean(s.get("performance", {}).get("accuracy", 0) or 0 for s in previous_three)

    if previous_avg <= 0:
        return None

    decline_pct = ((previous_avg - last_avg) / previous_avg) * 100

    if decline_pct > DECLINE_THRESHOLD_PCT:
        return {
            "priority": 5,
            "icon": "↩️",
            "title": "Return to basics",
            "description": (
                "Accuracy dropped recently. Try Level 1 again to rebuild "
                "confidence before moving up."
            ),
            "type": "regression",
        }
    return None


def rule_fatigue(sessions) -> Optional[dict]:
    if not sessions:
        return None

    with_fatigue = sum(1 for s in sessions if s.get("fatigueEvents"))
    ratio = with_fatigue / len(sessions)

    if ratio > FATIGUE_RATIO_THRESHOLD:
        return {
            "priority": 6,
            "icon": "😴",
            "title": "Take regular breaks",
            "description": (
                "Fatigue detected in most sessions. Try a 5-minute break halfway "
                "through each session."
            ),
            "type": "fatigue",
        }
    return None


def generate_steps(sessions):
    direction_accuracies = aggregate_direction_accuracy(sessions)

    candidates = [
        rule_weakest_direction(direction_accuracies),
        rule_session_duration(sessions),
        rule_session_frequency(sessions),
        rule_ready_for_level_2(sessions, direction_accuracies),
        rule_accuracy_declining(sessions),
        rule_fatigue(sessions),
    ]

    return [step for step in candidates if step is not None]


@router.get("/improvement-plan/{child_id}", response_model=ImprovementPlanResponse)
def get_improvement_plan(child_id: str):
    try:
        object_id = ObjectId(child_id)
    except InvalidId as err:
        raise HTTPException(status_code=400, detail="Invalid child_id") from err

    try:
        db = get_db()
        sessions = list(
            db.sessions.find({"childId": object_id})
            .sort("createdAt", -1)
            .limit(SESSIONS_TO_FETCH)
        )
    except PyMongoError as err:
        raise HTTPException(status_code=503, detail="Database unavailable") from err

    try:
        # sessions arrive newest-first; reverse to chronological order
        sessions = list(reversed(sessions))

        steps = generate_steps(sessions)
        steps.sort(key=lambda s: s["priority"])
        steps = steps[:MAX_STEPS]

        return ImprovementPlanResponse(
            steps=steps,
            generatedAt=datetime.now(timezone.utc),
            basedOnSessions=len(sessions),
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
