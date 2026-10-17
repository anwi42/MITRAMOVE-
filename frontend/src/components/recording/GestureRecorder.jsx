import { useEffect, useRef, useState } from 'react';
import useHandTracking from '../../hooks/useHandTracking';

const LABELS = ['REST', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'SELECT'];
const LABEL_TO_INDEX = { REST: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4, SELECT: 5 };

const SAMPLE_INTERVAL_MS = 100;
const FRAMES_PER_SAMPLE = 15;
const COUNTDOWN_START = 3;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function extractFrame(landmarks) {
  const frame = new Array(42);
  for (let i = 0; i < 21; i++) {
    frame[i * 2] = landmarks[i].x;
    frame[i * 2 + 1] = landmarks[i].y;
  }
  return frame;
}

export default function GestureRecorder() {
  const [currentLabel, setCurrentLabel] = useState('REST');
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [allSamples, setAllSamples] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const drawRafRef = useRef(null);
  const landmarksRef = useRef(null);
  const frameBufferRef = useRef([]);
  const captureIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const currentLabelRef = useRef(currentLabel);

  const { landmarks, isReady, error: trackingError, startTracking, stopTracking } =
    useHandTracking(null);

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    currentLabelRef.current = currentLabel;
  }, [currentLabel]);

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
    return () => {
      clearInterval(countdownIntervalRef.current);
      clearInterval(captureIntervalRef.current);
    };
  }, []);

  function beginCapture() {
    frameBufferRef.current = [];
    let ticks = 0;
    const maxTicks = FRAMES_PER_SAMPLE * 4;

    captureIntervalRef.current = setInterval(() => {
      ticks += 1;

      const hand = landmarksRef.current;
      if (hand) {
        frameBufferRef.current.push(extractFrame(hand));
      }

      if (frameBufferRef.current.length >= FRAMES_PER_SAMPLE || ticks >= maxTicks) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
        finishCapture();
      }
    }, SAMPLE_INTERVAL_MS);
  }

  function finishCapture() {
    const frames = frameBufferRef.current.slice(0, FRAMES_PER_SAMPLE);
    const label = currentLabelRef.current;

    if (frames.length === FRAMES_PER_SAMPLE) {
      setAllSamples((prev) => [...prev, { frames, label }]);
      setStatusMessage(`Recorded a ${label} sample!`);
    } else {
      setStatusMessage('Could not see your hand the whole time — try again.');
    }

    setIsRecording(false);
  }

  function handleRecord() {
    if (isRecording) return;

    setIsRecording(true);
    setStatusMessage('');
    setCountdown(COUNTDOWN_START);

    let remaining = COUNTDOWN_START;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setCountdown(null);
        beginCapture();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function handleDownload() {
    const samples = allSamples.map((s) => s.frames);
    const labelIndices = allSamples.map((s) => LABEL_TO_INDEX[s.label]);

    const payload = { samples, labels: labelIndices };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'recorded_data.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const counts = LABELS.reduce((acc, label) => {
    acc[label] = allSamples.filter((s) => s.label === label).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-primary-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">
          Gesture Data Recorder
        </h1>
        <p className="text-gray-500 mb-6 text-center">
          Record real gesture samples to help the model learn this child&apos;s movements.
        </p>

        <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-black aspect-[4/3] max-w-xl mx-auto">
          <video
            ref={videoRef}
            className="w-full h-full object-cover -scale-x-100"
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {countdown != null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-white text-6xl font-bold">{countdown}</span>
            </div>
          )}

          {isRecording && countdown == null && (
            <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full animate-pulse">
              ● Recording
            </div>
          )}
        </div>

        {(cameraError || trackingError) && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mt-4 text-center">
            {cameraError || trackingError}
          </div>
        )}

        <div className="card mt-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Select a gesture to record</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {LABELS.map((label) => (
              <button
                key={label}
                onClick={() => setCurrentLabel(label)}
                disabled={isRecording}
                className={`rounded-xl px-3 py-2 text-sm font-semibold border transition ${
                  currentLabel === label
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            className="btn-primary w-full mb-2"
            onClick={handleRecord}
            disabled={isRecording}
          >
            {isRecording ? 'Recording...' : `Record Gesture (${currentLabel})`}
          </button>

          {statusMessage && (
            <p className="text-sm text-gray-500 text-center mt-2">{statusMessage}</p>
          )}
        </div>

        <div className="card mt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Recorded: {LABELS.map((label) => `${label}: ${counts[label]}`).join(', ')}
          </p>
          <p className="text-xs text-gray-400 mb-4">Total samples: {allSamples.length}</p>
          <button
            className="btn-secondary w-full"
            onClick={handleDownload}
            disabled={allSamples.length === 0}
          >
            Download Training Data
          </button>
        </div>

        <div className="card mt-4 bg-primary-50/60">
          <p className="text-sm font-semibold text-gray-700 mb-1">Instructions</p>
          <p className="text-sm text-gray-500">
            Select a gesture label, perform the gesture, click Record. Aim for 50+ samples per
            class. Once you&apos;re happy with the recordings, download the training data and
            drop it in <code>ml/recorded_data.json</code> before running the training script.
          </p>
        </div>
      </div>
    </div>
  );
}
