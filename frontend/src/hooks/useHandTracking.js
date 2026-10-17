import { useCallback, useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const PINCH_THRESHOLD = 0.07;
const HOLD_DRIFT_THRESHOLD = 0.02;
const HOLD_DURATION_MS = 500;
const DEBOUNCE_FRAMES = 2;
const ROLLING_BUFFER_SIZE = 15;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extractFrame(hand) {
  const frame = new Array(42);
  for (let i = 0; i < 21; i++) {
    frame[i * 2] = hand[i].x;
    frame[i * 2 + 1] = hand[i].y;
  }
  return frame;
}

export default function useHandTracking(calibrationProfile) {
  const [landmarks, setLandmarks] = useState(null);
  const [gesture, setGesture] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [frameBuffer, setFrameBuffer] = useState([]);

  const rollingBufferRef = useRef([]);

  const handLandmarkerRef = useRef(null);
  const videoElementRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const calibrationProfileRef = useRef(calibrationProfile);
  const holdStartRef = useRef(null);
  const pendingGestureRef = useRef(null);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    calibrationProfileRef.current = calibrationProfile;
  }, [calibrationProfile]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        handLandmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to initialize hand tracking');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
    };
  }, []);

  const emitGesture = useCallback((rawGesture) => {
    if (rawGesture === pendingGestureRef.current) {
      pendingCountRef.current += 1;
    } else {
      pendingGestureRef.current = rawGesture;
      pendingCountRef.current = 1;
    }

    if (pendingCountRef.current >= DEBOUNCE_FRAMES) {
      setGesture((prev) => (prev === rawGesture ? prev : rawGesture));
    }
  }, []);

  const computeGesture = useCallback(
    (hand) => {
      const wrist = hand[0];
      const indexTip = hand[8];
      const thumbTip = hand[4];

      if (distance(indexTip, thumbTip) < PINCH_THRESHOLD) {
        return 'SELECT';
      }

      const cp = calibrationProfileRef.current;
      if (!cp || !cp.calibrated) {
        holdStartRef.current = null;
        return null;
      }

      if (wrist.x < cp.left) return 'LEFT';
      if (wrist.x > cp.right) return 'RIGHT';
      if (wrist.y < cp.up) return 'UP';
      if (wrist.y > cp.down) return 'DOWN';

      const driftFromRest = Math.hypot(wrist.x - cp.rest_x, wrist.y - cp.rest_y);
      if (driftFromRest <= HOLD_DRIFT_THRESHOLD) {
        if (holdStartRef.current == null) {
          holdStartRef.current = performance.now();
        } else if (performance.now() - holdStartRef.current >= HOLD_DURATION_MS) {
          return 'HOLD';
        }
      } else {
        holdStartRef.current = null;
      }

      return null;
    },
    []
  );

  const startTracking = useCallback(
    (videoElement) => {
      videoElementRef.current = videoElement;

      if (!handLandmarkerRef.current || !videoElement) return;
      if (rafRef.current) return;

      const loop = () => {
        const landmarker = handLandmarkerRef.current;
        const video = videoElementRef.current;

        if (!landmarker || !video) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;

          try {
            const result = landmarker.detectForVideo(video, performance.now());
            const hand = result.landmarks && result.landmarks[0] ? result.landmarks[0] : null;

            setLandmarks(hand);
            emitGesture(hand ? computeGesture(hand) : null);

            if (hand) {
              const next = [...rollingBufferRef.current, extractFrame(hand)];
              if (next.length > ROLLING_BUFFER_SIZE) next.shift();
              rollingBufferRef.current = next;
              setFrameBuffer(next);
            }
          } catch (err) {
            setError(err?.message || 'Hand tracking detection failed');
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    },
    [computeGesture, emitGesture]
  );

  const stopTracking = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    videoElementRef.current = null;
    lastVideoTimeRef.current = -1;
    holdStartRef.current = null;
    pendingGestureRef.current = null;
    pendingCountRef.current = 0;
    rollingBufferRef.current = [];
    setLandmarks(null);
    setGesture(null);
    setFrameBuffer([]);
  }, []);

  return { landmarks, gesture, isReady, error, startTracking, stopTracking, frameBuffer };
}
