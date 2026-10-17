import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Phaser from 'phaser';
import FishScene from './FishScene';
import api from '../../utils/api';
import useHandTracking from '../../hooks/useHandTracking';

const PHASER_CONTAINER_ID = 'fish-phaser-container';
const WRIST_DELTA_THRESHOLD_X = 0.003;
const WRIST_DELTA_THRESHOLD_Y = 0.008;
const WRIST_HISTORY_SIZE_X = 2;
const WRIST_HISTORY_SIZE_Y = 3;
const DIRECTION_VELOCITY_SCALE_X = 25;
const DIRECTION_VELOCITY_SCALE_Y = 15;

export default function FishGame({ child: childProp } = {}) {
  const navigate = useNavigate();
  const child = childProp;

  const gameRef = useRef(null);
  const sceneControllerRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const previousWristRef = useRef(null);
  const wristHistoryXRef = useRef([]);
  const wristHistoryYRef = useRef([]);
  const frameCountRef = useRef(0);
  const sessionStartRef = useRef(null);

  const [phase, setPhase] = useState('levelSelect');
  const [level, setLevel] = useState(1);
  const [foodEaten, setFoodEaten] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const { landmarks, startTracking, stopTracking } = useHandTracking();

  useEffect(() => {
    if (!child) {
      navigate('/dashboard', { replace: true });
    }
  }, [child, navigate]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    sessionStartRef.current = Date.now();

    const config = {
      level,
      onFoodEaten: (newFoodEaten) => setFoodEaten(newFoodEaten),
      onGameEnd: handleGameEnd,
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: PHASER_CONTAINER_ID,
      backgroundColor: '#1a6ba0',
      scene: FishScene,
    });

    game.scene.start('FishScene', config);

    game.setDirection = (x, y) => {
      const scene = game.scene.getScene('FishScene');
      if (scene) scene.setDirection(x, y);
    };

    game.stopGame = () => {
      const scene = game.scene.getScene('FishScene');
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
  }, [phase, level]);

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
      frameCountRef.current = 0;
    };
  }, [phase, startTracking, stopTracking]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (!landmarks || !landmarks[0]) {
      previousWristRef.current = null;
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

      const dirX =
        Math.abs(avgDeltaX) > WRIST_DELTA_THRESHOLD_X ? avgDeltaX * DIRECTION_VELOCITY_SCALE_X : 0;
      const dirY =
        Math.abs(avgDeltaY) > WRIST_DELTA_THRESHOLD_Y ? avgDeltaY * DIRECTION_VELOCITY_SCALE_Y : 0;

      frameCountRef.current += 1;
      if (frameCountRef.current % 30 === 0) {
        console.log(
          '[FishGame]',
          JSON.stringify({
            rawDeltaX,
            rawDeltaY,
            avgX: avgDeltaX,
            avgY: avgDeltaY,
            direction: { x: dirX, y: dirY },
          })
        );
      }

      sceneControllerRef.current?.setDirection(dirX, dirY);
    }

    previousWristRef.current = { x: wrist.x, y: wrist.y };
  }, [landmarks, phase]);

  async function handleGameEnd(stats) {
    setPhase('saving');

    const sessionDurationSec = sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0;

    const participationValues = {
      initiationRate: 0.9,
      persistenceRate: 1,
      generalizationScore: 0.7,
      communicationFreq: 0,
      adaptationVelocity: level / 2,
    };
    const total =
      Object.values(participationValues).reduce((a, b) => a + b, 0) /
      Object.values(participationValues).length;

    const payload = {
      childId: child._id,
      module: 'fish',
      duration: sessionDurationSec,
      performance: {
        accuracy: 1,
        responseTime: stats.avgResponseTime,
        attempts: stats.foodEaten,
        successRate: 1,
        difficultyReached: level,
      },
      participationScore: {
        ...participationValues,
        total,
      },
      directionStats: stats.directionStats,
    };

    setSaving(true);
    try {
      await api.post('/sessions', payload);
    } catch (err) {
      console.error('Failed to save fish session', err);
    } finally {
      setSaving(false);
    }

    navigate('/dashboard');
  }

  function handleStop() {
    if (gameRef.current && typeof gameRef.current.stopGame === 'function') {
      gameRef.current.stopGame();
    }
  }

  function startLevel(selectedLevel) {
    setLevel(selectedLevel);
    setFoodEaten(0);
    setPhase('playing');
  }

  if (!child) {
    return null;
  }

  if (phase === 'levelSelect') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#1a6ba0' }}>
        <div className="card w-full max-w-lg text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-800">🐠 Fish Adventure</h1>
          <p className="text-gray-500">Choose a level for {child.name}</p>

          <button
            className="btn-primary w-full text-left px-5 py-4"
            onClick={() => startLevel(1)}
          >
            <span className="block font-bold">LEVEL 1 — Beginner</span>
            <span className="block text-sm font-normal opacity-90">
              Just swim and eat food. No obstacles, no time pressure.
            </span>
          </button>

          <button
            className="btn-secondary w-full text-left px-5 py-4"
            onClick={() => startLevel(2)}
          >
            <span className="block font-bold text-gray-800">LEVEL 2 — Challenge</span>
            <span className="block text-sm text-gray-500">
              Avoid the jellyfish while collecting food!
            </span>
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#1a6ba0' }}>
        <div className="card w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Great swimming, {child.name}!</h1>
          <p className="text-sm text-gray-400">
            {saving ? 'Saving your progress...' : 'Returning to dashboard...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: '#1a6ba0' }}>
      <div className="absolute top-4 left-4 z-10 bg-white/90 rounded-full px-4 py-2 shadow">
        <span className="font-semibold text-gray-700">Food eaten: {foodEaten}</span>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-white/90 rounded-full px-4 py-2 shadow">
        <span className="font-semibold text-gray-700">Level {level}</span>
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
