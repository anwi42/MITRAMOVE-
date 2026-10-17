import { useEffect, useRef, useState } from 'react';
import useHandTracking from '../../hooks/useHandTracking';
import api from '../../utils/api';

const CALIBRATION_DURATION_S = 30;
const SAMPLE_INTERVAL_MS = 100;
const THRESHOLD_MULTIPLIER = 2.5;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values, avg) {
  if (values.length === 0) return 0;
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

export default function CalibrationScreen({ child, onCalibrationComplete, onSkip }) {
  const [uiState, setUiState] = useState('instructions');
  const [countdown, setCountdown] = useState(CALIBRATION_DURATION_S);
  const [cameraError, setCameraError] = useState(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const samplesRef = useRef({ restX: [], restY: [] });
  const countdownIntervalRef = useRef(null);
  const sampleIntervalRef = useRef(null);
  const drawRafRef = useRef(null);
  const computedProfileRef = useRef(null);
  const landmarksRef = useRef(null);

  const { landmarks, isReady, error: trackingError, startTracking, stopTracking } =
    useHandTracking(null);

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    let cancelled = false;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      stopTracking();
    };
  }, [stopTracking]);

  useEffect(() => {
    if (isReady && videoRef.current && !cameraError) {
      startTracking(videoRef.current);
    }
  }, [isReady, cameraError, startTracking]);

  useEffect(() => {
    function drawOverlay() {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      if (canvas && video && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (landmarks) {
          const toX = (lm) => canvas.width - lm.x * canvas.width;
          const toY = (lm) => lm.y * canvas.height;

          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = 3;
          HAND_CONNECTIONS.forEach(([start, end]) => {
            ctx.beginPath();
            ctx.moveTo(toX(landmarks[start]), toY(landmarks[start]));
            ctx.lineTo(toX(landmarks[end]), toY(landmarks[end]));
            ctx.stroke();
          });

          ctx.fillStyle = '#ec4899';
          landmarks.forEach((lm) => {
            ctx.beginPath();
            ctx.arc(toX(lm), toY(lm), 5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      drawRafRef.current = requestAnimationFrame(drawOverlay);
    }

    drawRafRef.current = requestAnimationFrame(drawOverlay);

    return () => {
      if (drawRafRef.current) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
    };
  }, [landmarks]);

  useEffect(() => {
    if (uiState !== 'calibrating') return undefined;

    samplesRef.current = { restX: [], restY: [] };
    setCountdown(CALIBRATION_DURATION_S);

    sampleIntervalRef.current = setInterval(() => {
      const hand = landmarksRef.current;
      if (hand) {
        const wrist = hand[0];
        samplesRef.current.restX.push(wrist.x);
        samplesRef.current.restY.push(wrist.y);
      }
    }, SAMPLE_INTERVAL_MS);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          clearInterval(sampleIntervalRef.current);
          finishCalibration();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdownIntervalRef.current);
      clearInterval(sampleIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState]);

  async function finishCalibration() {
    const { restX, restY } = samplesRef.current;

    const meanX = mean(restX);
    const meanY = mean(restY);
    const driftX = stdDev(restX, meanX);
    const driftY = stdDev(restY, meanY);

    const calibrationProfile = {
      rest_x: meanX,
      rest_y: meanY,
      drift_x: driftX,
      drift_y: driftY,
      left: meanX - THRESHOLD_MULTIPLIER * driftX,
      right: meanX + THRESHOLD_MULTIPLIER * driftX,
      up: meanY - THRESHOLD_MULTIPLIER * driftY,
      down: meanY + THRESHOLD_MULTIPLIER * driftY,
      calibrated: true,
    };

    computedProfileRef.current = calibrationProfile;
    setUiState('complete');
    setSaving(true);

    try {
      await api.put(`/children/${child._id}`, { calibrationProfile });
    } catch (err) {
      console.error('Failed to save calibration profile', err);
    } finally {
      setSaving(false);
    }
  }

  function handleStart() {
    setUiState('calibrating');
  }

  function handleContinue() {
    if (typeof onCalibrationComplete === 'function') {
      onCalibrationComplete(computedProfileRef.current);
    }
  }

  const progressPct = ((CALIBRATION_DURATION_S - countdown) / CALIBRATION_DURATION_S) * 100;

  return (
    <div className="min-h-screen bg-primary-50 flex items-center justify-center px-4 py-8">
      <div className="relative w-full max-w-2xl">
        <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover -scale-x-100"
            muted
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        <div className="card mt-4 text-center">
          {(cameraError || trackingError) && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {cameraError || trackingError}
            </div>
          )}

          {uiState === 'instructions' && (
            <>
              <h1 className="text-2xl font-bold text-gray-800 mb-3">
                Let&apos;s learn how you move 🌸
              </h1>
              <p className="text-gray-500 mb-6">
                Just sit comfortably and rest your hand naturally. We&apos;ll watch for 30
                seconds — no need to do anything special!
              </p>
              <button className="btn-primary w-full mb-3" onClick={handleStart}>
                Start
              </button>
              {typeof onSkip === 'function' && (
                <button
                  className="btn-secondary w-full"
                  onClick={onSkip}
                >
                  Skip Calibration
                </button>
              )}
            </>
          )}

          {uiState === 'calibrating' && (
            <>
              <p className="text-4xl font-bold text-primary-600 mb-2">{countdown}</p>
              <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-primary-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-gray-500">
                Just relax... we&apos;re learning your natural movement
              </p>
            </>
          )}

          {uiState === 'complete' && (
            <>
              <h1 className="text-2xl font-bold text-gray-800 mb-3">
                ✅ All done! We know how you move now.
              </h1>
              <p className="text-sm text-gray-400 mb-4">
                {saving ? 'Saving your profile...' : 'Profile saved.'}
              </p>
              <button className="btn-primary w-full" onClick={handleContinue} disabled={saving}>
                Continue to Game
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
