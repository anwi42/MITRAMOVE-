import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import Phaser from 'phaser';
import FlowerScene from './FlowerScene';
import api from '../../utils/api';
import useHandTracking from '../../hooks/useHandTracking';
import useGestureModel from '../../hooks/useGestureModel';

const GAME_DURATION = 60;
const PHASER_CONTAINER_ID = 'phaser-container';

const GESTURE_EMOJI = {
  LEFT: '👈',
  RIGHT: '👉',
  UP: '👆',
  DOWN: '👇',
  SELECT: '🤏',
  HOLD: '✋',
};

function createStatsRef() {
  return {
    hits: 0,
    misses: 0,
    totalAttempts: 0,
    responseTimes: [],
    difficulty: 1,
    difficultyLog: [],
  };
}

export default function FlowerGame({ child: childProp } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const child = childProp || location.state?.child;

  const webcamMode =
    !!child &&
    (child.preferredInteraction === 'webcam' || child.preferredInteraction === 'mixed');

  const gameRef = useRef(null);
  const statsRef = useRef(createStatsRef());
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const lastGestureRef = useRef(null);
  const gestureSelectRef = useRef(null);

  const [phase, setPhase] = useState('pre');
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const { landmarks, gesture, startTracking, stopTracking, frameBuffer } = useHandTracking(
    child?.calibrationProfile
  );
  const { isModelReady, modelError, runInference } = useGestureModel();

  const [modelGesture, setModelGesture] = useState(null);
  const [modelConfidence, setModelConfidence] = useState(0);

  const useModelGesture =
    isModelReady && modelGesture && modelGesture !== 'REST' && modelConfidence > 0.75;
  const activeGesture = useModelGesture ? modelGesture : gesture;

  useEffect(() => {
    if (!child) {
      navigate('/dashboard', { replace: true });
    }
  }, [child, navigate]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    setTimeLeft(GAME_DURATION);
    const interval = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    const config = {
      difficulty: 1,
      gameDuration: GAME_DURATION,
      onHit: handleHit,
      onMiss: handleMiss,
      onDifficultyChange: handleDifficultyChange,
      onGameEnd: handleGameEnd,
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: PHASER_CONTAINER_ID,
      backgroundColor: '#e8f5e9',
      scene: FlowerScene,
    });

    game.scene.start('FlowerScene', config);

    game.gestureSelect = () => {
      const scene = game.scene.getScene('FlowerScene');
      if (scene && scene.currentFlower) {
        scene.handleGestureSelect();
      }
    };

    gameRef.current = game;
    gestureSelectRef.current = game;

    return () => {
      gestureSelectRef.current = null;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [phase]);

  useEffect(() => {
    if (!webcamMode || phase !== 'playing') return undefined;

    let cancelled = false;
    let stream;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        webcamStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          await webcamVideoRef.current.play();
          startTracking(webcamVideoRef.current);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(err?.message || 'Could not access the webcam.');
        }
      }
    }

    setupCamera();

    return () => {
      cancelled = true;
      stopTracking();
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
        webcamStreamRef.current = null;
      }
    };
  }, [webcamMode, phase, startTracking, stopTracking]);

  useEffect(() => {
    if (!webcamMode || phase !== 'playing' || !isModelReady) return undefined;
    if (!frameBuffer || frameBuffer.length !== 15) return undefined;

    let cancelled = false;
    runInference(frameBuffer).then((result) => {
      if (cancelled || !result) return;
      setModelGesture(result.gesture);
      setModelConfidence(result.confidence);
    });

    return () => {
      cancelled = true;
    };
  }, [frameBuffer, isModelReady, runInference, webcamMode, phase]);

  useEffect(() => {
    if (!webcamMode || phase !== 'playing') return undefined;

    if (
      activeGesture === 'SELECT' &&
      lastGestureRef.current !== 'SELECT' &&
      gestureSelectRef.current
    ) {
      gestureSelectRef.current.gestureSelect();
    }

    lastGestureRef.current = activeGesture;
  }, [activeGesture, webcamMode, phase]);

  function handleHit(responseTime) {
    const stats = statsRef.current;
    stats.hits += 1;
    stats.totalAttempts += 1;
    stats.responseTimes.push(responseTime);
    setScore(stats.hits);
  }

  function handleMiss() {
    const stats = statsRef.current;
    stats.misses += 1;
    stats.totalAttempts += 1;
  }

  function handleDifficultyChange(newLevel) {
    const stats = statsRef.current;
    stats.difficulty = newLevel;
    stats.difficultyLog.push({
      level: newLevel,
      atAttempt: stats.totalAttempts,
      timestamp: Date.now(),
    });
    setDifficulty(newLevel);
  }

  async function handleGameEnd() {
    const stats = statsRef.current;
    const totalAttempts = stats.totalAttempts;
    const hits = stats.hits;
    const avgResponseTime =
      stats.responseTimes.length > 0
        ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
        : 0;
    const accuracy = totalAttempts > 0 ? (hits / totalAttempts) * 100 : 0;
    const successRate = totalAttempts > 0 ? hits / totalAttempts : 0;

    setResults({
      accuracy,
      hits,
      misses: stats.misses,
      totalAttempts,
      difficultyReached: stats.difficulty,
    });
    setPhase('results');

    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const participationValues = {
      initiationRate: 0.9,
      persistenceRate: successRate,
      generalizationScore: 0.7,
      communicationFreq: 0,
      adaptationVelocity: stats.difficulty / 5,
    };
    const total =
      Object.values(participationValues).reduce((a, b) => a + b, 0) /
      Object.values(participationValues).length;

    const payload = {
      childId: child._id,
      module: 'flower',
      duration: GAME_DURATION,
      performance: {
        accuracy,
        responseTime: avgResponseTime,
        attempts: totalAttempts,
        successRate,
        gestureConfidence: 1.0,
        difficultyReached: stats.difficulty,
      },
      participationScore: {
        ...participationValues,
        total,
      },
      difficultyLog: stats.difficultyLog,
      fatigueEvents: [],
    };

    setSaving(true);
    try {
      await api.post('/sessions', payload);
    } catch (err) {
      console.error('Failed to save session', err);
    } finally {
      setSaving(false);
    }

    setTimeout(() => {
      navigate('/dashboard');
    }, 3000);
  }

  function startGame() {
    statsRef.current = createStatsRef();
    setScore(0);
    setDifficulty(1);
    setResults(null);
    setPhase('playing');
  }

  if (!child) {
    return null;
  }

  if (phase === 'pre') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{child.name}</h1>
          <p className="text-gray-500 mb-6">Ready to play?</p>
          <button className="btn-primary w-full mb-3" onClick={startGame}>
            Start
          </button>
          <Link to="/dashboard" className="text-sm text-gray-500 underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Great job, {child.name}!</h1>
          <div className="space-y-2 mb-6">
            <p className="text-gray-600">
              Accuracy: <span className="font-semibold">{results?.accuracy.toFixed(1)}%</span>
            </p>
            <p className="text-gray-600">
              Flowers Bloomed: <span className="font-semibold">{results?.hits}</span>
            </p>
            <p className="text-gray-600">
              Difficulty Reached:{' '}
              <span className="font-semibold">{results?.difficultyReached}</span>
            </p>
          </div>
          <p className="text-sm text-gray-400">
            {saving ? 'Saving your progress...' : 'Returning to dashboard...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-50 relative">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-6 bg-white/90 rounded-full px-6 py-2 shadow">
        <span className="font-semibold text-gray-700">Time: {timeLeft}s</span>
        <span className="font-semibold text-gray-700">Score: {score}</span>
        <span className="font-semibold">
          <span className="text-accent-500">{'★'.repeat(difficulty)}</span>
          <span className="text-gray-300">{'★'.repeat(5 - difficulty)}</span>
        </span>
        {webcamMode && (
          <span className="text-2xl flex items-center gap-1" title="Detected gesture">
            {activeGesture ? GESTURE_EMOJI[activeGesture] : '—'}
            {useModelGesture && (
              <span className="text-xs font-semibold text-gray-500">
                {Math.round(modelConfidence * 100)}%
              </span>
            )}
          </span>
        )}
        {webcamMode && modelError && (
          <span className="text-xs text-gray-400" title={modelError}>
            (rule-based)
          </span>
        )}
      </div>
      <div id={PHASER_CONTAINER_ID} className="flex items-center justify-center pt-20" />

      {webcamMode && (
        <div className="fixed bottom-4 right-4 w-40 h-[120px] rounded-xl overflow-hidden shadow-lg border-2 border-white z-10 bg-black">
          <video
            ref={webcamVideoRef}
            className="w-full h-full object-cover -scale-x-100"
            muted
            playsInline
          />
          {cameraError && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2">
              <p className="text-white text-xs text-center">Camera unavailable</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
