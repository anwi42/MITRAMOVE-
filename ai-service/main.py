import logging
import os
from collections import Counter
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from algorithms.bandit import ThompsonSamplingBandit
from algorithms.fatigue import FatigueDetector
from database import get_db
from routes.insights import router as insights_router
from routes.improvement_plan import router as improvement_plan_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mitramove-ai-service")

app = FastAPI(title="MitraMove AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bandit = ThompsonSamplingBandit()
fatigue_detector = FatigueDetector()

app.include_router(insights_router)
app.include_router(improvement_plan_router)

DEFAULT_AAC_WORDS = ["help", "yes", "no", "more", "stop"]

TIME_OF_DAY_WORDS = {
    "morning": ["eat", "drink", "school", "help", "toilet"],
    "afternoon": ["play", "eat", "water", "help", "tired"],
    "evening": ["eat", "sleep", "tired", "home", "mom"],
    "night": ["sleep", "tired", "mom", "water", "toilet"],
}


class SessionResult(BaseModel):
    level: int = Field(..., ge=1, le=5)
    score: float = Field(..., ge=0)
    duration_sec: float = Field(..., ge=0)
    completed: bool = False


class RecommendRequest(BaseModel):
    child_id: str
    session_results: List[SessionResult] = Field(default_factory=list)


class RecommendResponse(BaseModel):
    recommended_level: int
    confidence: float


class FatigueRequest(BaseModel):
    reaction_times: List[float] = Field(default_factory=list)
    accuracy_history: List[float] = Field(default_factory=list)
    session_duration_sec: float = Field(0, ge=0)


class FatigueResponse(BaseModel):
    fatigue_score: float
    is_fatigued: bool
    suggestion: str


class AACSuggestRequest(BaseModel):
    child_id: str
    recent_words: List[str] = Field(default_factory=list)
    time_of_day: str = "afternoon"


class AACSuggestResponse(BaseModel):
    suggestions: List[str]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/recommend", response_model=RecommendResponse)
def recommend(payload: RecommendRequest):
    try:
        db = get_db()
        collection = db.bandit_weights

        doc = collection.find_one({"child_id": payload.child_id})
        weights = doc["weights"] if doc and "weights" in doc else bandit.default_weights()

        session_results = [result.model_dump() for result in payload.session_results]
        updated_weights = bandit.update(weights, session_results)

        recommended_level, confidence = bandit.recommend(updated_weights)

        collection.update_one(
            {"child_id": payload.child_id},
            {
                "$set": {
                    "weights": updated_weights,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

        return RecommendResponse(recommended_level=recommended_level, confidence=confidence)
    except PyMongoError as err:
        logger.exception("MongoDB error in /recommend")
        raise HTTPException(status_code=503, detail="Database unavailable") from err
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Unexpected error in /recommend")
        raise HTTPException(status_code=500, detail=str(err)) from err


@app.post("/fatigue", response_model=FatigueResponse)
def fatigue(payload: FatigueRequest):
    try:
        fatigue_score, is_fatigued, suggestion = fatigue_detector.detect(
            payload.reaction_times,
            payload.accuracy_history,
            payload.session_duration_sec,
        )
        return FatigueResponse(
            fatigue_score=fatigue_score,
            is_fatigued=is_fatigued,
            suggestion=suggestion,
        )
    except Exception as err:
        logger.exception("Unexpected error in /fatigue")
        raise HTTPException(status_code=500, detail=str(err)) from err


@app.post("/aac-suggest", response_model=AACSuggestResponse)
def aac_suggest(payload: AACSuggestRequest):
    try:
        counts = Counter(word.lower() for word in payload.recent_words if word)
        ranked = [word for word, _ in counts.most_common()]

        time_words = TIME_OF_DAY_WORDS.get(payload.time_of_day.lower(), DEFAULT_AAC_WORDS)

        suggestions = []
        for word in ranked + time_words + DEFAULT_AAC_WORDS:
            if word not in suggestions:
                suggestions.append(word)
            if len(suggestions) >= 5:
                break

        return AACSuggestResponse(suggestions=suggestions[:5])
    except Exception as err:
        logger.exception("Unexpected error in /aac-suggest")
        raise HTTPException(status_code=500, detail=str(err)) from err


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
