from statistics import mean

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from database import get_db

router = APIRouter()

TREND_UP_THRESHOLD = 5
TREND_DOWN_THRESHOLD = -5
HIGH_ACCURACY_THRESHOLD = 80
LOW_ACCURACY_THRESHOLD = 50
MIN_SESSIONS_FOR_PROGRESS_TIP = 3
SESSIONS_TO_FETCH = 7
FIXED_CONFIDENCE = 85


class InsightResponse(BaseModel):
    insight: str
    avgAccuracy: float
    trend: str
    confidence: int


@router.get("/insights/{child_id}", response_model=InsightResponse)
def get_insight(child_id: str):
    try:
        object_id = ObjectId(child_id)
    except InvalidId as err:
        raise HTTPException(status_code=400, detail="Invalid child_id") from err

    try:
        db = get_db()
        sessions = list(
            db.sessions.find({"childId": object_id}).sort("createdAt", -1).limit(SESSIONS_TO_FETCH)
        )
    except PyMongoError as err:
        raise HTTPException(status_code=503, detail="Database unavailable") from err

    try:
        # sessions arrive newest-first; reverse to chronological order
        sessions = list(reversed(sessions))

        accuracies = [float(s.get("performance", {}).get("accuracy", 0) or 0) for s in sessions]
        avg_accuracy = mean(accuracies) if accuracies else 0.0

        if len(accuracies) >= 2:
            diff = accuracies[-1] - accuracies[0]
            if diff > TREND_UP_THRESHOLD:
                trend = "up"
            elif diff < TREND_DOWN_THRESHOLD:
                trend = "down"
            else:
                trend = "stable"
        else:
            trend = "stable"

        messages = []

        if avg_accuracy > HIGH_ACCURACY_THRESHOLD:
            messages.append("Ready for next difficulty level! 🌟")
        if avg_accuracy < LOW_ACCURACY_THRESHOLD:
            messages.append("Try Level 1 to build confidence.")

        if trend == "up":
            messages.append("Accuracy improving this week! 📈")
        elif trend == "down":
            messages.append("Try shorter sessions this week.")
        else:
            messages.append("Consistent performance this week.")

        if len(sessions) < MIN_SESSIONS_FOR_PROGRESS_TIP:
            messages.append("Play more often for faster progress.")

        return InsightResponse(
            insight=" ".join(messages),
            avgAccuracy=round(avg_accuracy, 1),
            trend=trend,
            confidence=FIXED_CONFIDENCE,
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
