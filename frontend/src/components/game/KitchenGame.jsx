import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import Phaser from 'phaser';
import KitchenScene from './KitchenScene';
import api from '../../utils/api';
import useHandTracking from '../../hooks/useHandTracking';
import CalibrationScreen from '../calibration/CalibrationScreen';

const PHASER_CONTAINER_ID = 'kitchen-phaser-container';

const GESTURE_EMOJI = {
  LEFT: '👈',
  RIGHT: '👉',
  UP: '👆',
  DOWN: '👇',
  SELECT: '🤏',
  HOLD: '✋',
};

const WRIST_DELTA_THRESHOLD_X = 0.003;
const WRIST_DELTA_THRESHOLD_Y = 0.008;
const WRIST_HISTORY_SIZE_X = 2;
const WRIST_HISTORY_SIZE_Y = 3;
const HOLD_DURATION_MS = 500;

export default function KitchenGame({ child: childProp } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const child = childProp || location.state?.child;

  const gameRef = useRef(null);
  const sceneControllerRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const sessionStartRef = useRef(null);
  const finalSessionRef = useRef(null);
  const previousWristRef = useRef(null);
  const wristHistoryXRef = useRef([]);
  const wristHistoryYRef = useRef([]);
  const holdStartRef = useRef(null);
  const frameCountRef = useRef(0);

  const [child_, setChild] = useState(child || null);
  const [calibrationSkipped, setCalibrationSkipped] = useState(false);
  const [phase, setPhase] = useState('ready');
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [fatigueAlert, setFatigueAlert] = useState(null);
  const [gesture, setGesture] = useState(null);

  const { landmarks, startTracking, stopTracking } = useHandTracking();

  useEffect(() => {
    if (!child_) {
      navigate('/dashboard', { replace: true });
    }
  }, [child_, navigate]);

  const needsCalibration = Boolean(child_) && !child_.calibrationProfile?.calibrated && !calibrationSkipped;

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    sessionStartRef.current = Date.now();

    const config = {
      onScoreUpdate: ({ score: newScore }) => setScore(newScore),
      onFatigueDetected: (event) => setFatigueAlert(event),
      onSessionUpdate: (sessionData) => {
        finalSessionRef.current = sessionData;
      },
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: PHASER_CONTAINER_ID,
      backgroundColor: '#fff8dc',
      scene: KitchenScene,
    });

    game.scene.start('KitchenScene', config);

    game.setGestureData = (g, hand, lm) => {
      const scene = game.scene.getScene('KitchenScene');
      if (scene) scene.setGestureData(g, hand, lm);
    };

    game.stopGame = () => {
      const scene = game.scene.getScene('KitchenScene');
      if (scene) scene.stopGame();
    };

    gameRef.current = game;
    sceneControllerRef.current = game;

    return () => {
      sceneControllerRef.current = null;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;

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
      previousWristRef.current = null;
      wristHistoryXRef.current = [];
      wristHistoryYRef.current = [];
      holdStartRef.current = null;
      frameCountRef.current = 0;
    };
  }, [phase, startTracking, stopTracking]);

  useEffect(() => {
    if (phase !== 'playing') return;

    if (!landmarks || !landmarks[0]) {
      previousWristRef.current = null;
      holdStartRef.current = null;
      setGesture(null);
      sceneControllerRef.current?.setGestureData(null, null, landmarks);
      return;
    }

    const wrist = landmarks[0];

    if (previousWristRef.current) {
      const rawDeltaX = wrist.x - previousWristRef.current.x;
      const rawDeltaY = wrist.y - previousWristRef.current.y;

      const historyX = [...wristHistoryXRef.current, rawDeltaX].slice(-WRIST_HISTORY_SIZE_X);
      wristHistoryXRef.current = historyX;

      const historyY = [...wristHistoryYRef.current, rawDeltaY].slice(-WRIST_HISTORY_SIZE_Y);
      wristHistoryYRef.current = historyY;

      const avgDeltaX = historyX.reduce((sum, d) => sum + d, 0) / historyX.length;
      const avgDeltaY = historyY.reduce((sum, d) => sum + d, 0) / historyY.length;

      let detectedGesture = null;

      if (
        Math.abs(avgDeltaX) > WRIST_DELTA_THRESHOLD_X ||
        Math.abs(avgDeltaY) > WRIST_DELTA_THRESHOLD_Y
      ) {
        holdStartRef.current = null;
        if (Math.abs(avgDeltaX) >= Math.abs(avgDeltaY)) {
          detectedGesture = avgDeltaX > 0 ? 'LEFT' : 'RIGHT';
        } else {
          detectedGesture = avgDeltaY > 0 ? 'DOWN' : 'UP';
        }
      } else {
        if (holdStartRef.current == null) {
          holdStartRef.current = performance.now();
        }
        if (performance.now() - holdStartRef.current >= HOLD_DURATION_MS) {
          detectedGesture = 'HOLD';
        }
      }

      frameCountRef.current += 1;
      if (frameCountRef.current % 30 === 0) {
        console.log(
          '[KitchenGame]',
          JSON.stringify({ avgDeltaX, avgDeltaY, gesture: detectedGesture })
        );
      }

      setGesture(detectedGesture);
      sceneControllerRef.current?.setGestureData(detectedGesture, null, landmarks);
    }

    previousWristRef.current = { x: wrist.x, y: wrist.y };
  }, [landmarks, phase]);

  async function handleStop() {
    if (gameRef.current && typeof gameRef.current.stopGame === 'function') {
      gameRef.current.stopGame();
    }

    setPhase('saving');

    const sessionDurationSec = sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0;

    const finalData = finalSessionRef.current || {};
    const successRate =
      finalData.performance?.attempts > 0
        ? finalData.performance.hits / finalData.performance.attempts
        : 0;

    const participationValues = {
      initiationRate: 0.9,
      persistenceRate: successRate,
      generalizationScore: 0.7,
      communicationFreq: 0,
      adaptationVelocity: 0.7,
    };
    const total =
      Object.values(participationValues).reduce((a, b) => a + b, 0) /
      Object.values(participationValues).length;

    const payload = {
      childId: child_._id,
      module: 'kitchen',
      duration: sessionDurationSec,
      performance: finalData.performance || {},
      phaseStats: finalData.phaseStats || {},
      participationScore: {
        ...participationValues,
        total,
      },
      fatigueEvents: finalData.fatigueEvents || [],
      movementQuality: finalData.movementQuality || {},
    };

    setSaving(true);
    try {
      await api.post('/sessions', payload);
    } catch (err) {
      console.error('Failed to save kitchen session', err);
    } finally {
      setSaving(false);
    }

    navigate('/dashboard');
  }

  function handleStart() {
    setScore(0);
    setFatigueAlert(null);
    finalSessionRef.current = null;
    setPhase('playing');
  }

  if (!child_) {
    return null;
  }

  if (needsCalibration) {
    return (
      <CalibrationScreen
        child={child_}
        onCalibrationComplete={(calibrationProfile) => {
          setChild((prev) => ({ ...prev, calibrationProfile }));
        }}
        onSkip={() => setCalibrationSkipped(true)}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-amber-100 to-amber-200">
        <div className="card w-full max-w-lg text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-800">🍵 Kitchen Helper</h1>
          <p className="text-gray-500">
            Ready to help, {child_.animalEmoji ? `${child_.animalEmoji} ` : ''}
            {child_.name}?
          </p>

          <button className="btn-secondary py-3 px-8 font-bold" onClick={handleStart}>
            Start
          </button>

          <Link to="/dashboard" className="text-sm text-gray-500 underline block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'saving') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-amber-100 to-amber-200">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            Great helping, {child_.animalEmoji ? `${child_.animalEmoji} ` : ''}
            {child_.name}!
          </h1>
          <p className="text-sm text-gray-400">
            {saving ? 'Saving your progress...' : 'Returning to dashboard...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-amber-100 to-amber-200">
      <div className="absolute top-4 left-4 z-10 bg-white/90 rounded-full px-4 py-2 shadow flex items-center gap-3">
        <span className="font-semibold text-gray-700">Score: {score}</span>
        <span className="text-2xl" title="Detected gesture">
          {gesture ? GESTURE_EMOJI[gesture] || gesture : '—'}
        </span>
        <span className="text-sm font-semibold text-gray-600">
          Gesture: {gesture || 'none'}
        </span>
      </div>

      {fatigueAlert && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-orange-100 border border-orange-300 text-orange-700 rounded-xl px-5 py-2.5 shadow flex items-center gap-3">
          <span className="text-sm font-medium">😴 Looking a bit tired — consider a short break</span>
          <button className="text-orange-500 font-bold" onClick={() => setFatigueAlert(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 bg-white/90 rounded-xl px-5 py-2 shadow text-sm font-medium text-gray-700 text-center max-w-md">
        1. Reach the item → 2. HOLD to grip → 3. Carry to target → 4. Open hand to place ✓
      </div>

      <div id={PHASER_CONTAINER_ID} className="flex items-center justify-center pt-20" />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <button
          className="bg-red-500 hover:bg-red-600 transition text-white font-bold text-lg px-10 py-4 rounded-full shadow-lg"
          onClick={handleStop}
        >
          ⏹ STOP
        </button>
      </div>

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
    </div>
  );
}
