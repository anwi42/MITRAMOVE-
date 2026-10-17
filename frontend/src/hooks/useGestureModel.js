import { useCallback, useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';

ort.env.wasm.wasmPaths = '/ort-wasm/';
ort.env.wasm.numThreads = 1;
console.log('[GestureModel] WASM path set to local /ort-wasm/');

const MODEL_URL = '/models/gesture_model.onnx';
const LABEL_NAMES = ['REST', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'SELECT'];
const SEQ_LEN = 15;
const NUM_FEATURES = 42;

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

export default function useGestureModel() {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError, setModelError] = useState(null);

  const sessionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      console.log('[GestureModel] Starting model load...');
      try {
        const session = await ort.InferenceSession.create(MODEL_URL);
        if (cancelled) return;

        console.log('[GestureModel] Model loaded successfully ✅');
        sessionRef.current = session;
        setIsModelReady(true);
      } catch (err) {
        console.error('[GestureModel] Failed to load model:', err);
        if (!cancelled) {
          setModelError('Model not found — using rule-based detection');
          console.warn('[GestureModel] Model error:', '[GestureModel] Model not found — using rule-based detection');
        }
      }
    }

    loadModel();

    return () => {
      cancelled = true;
      sessionRef.current = null;
    };
  }, []);

  const runInference = useCallback(async (frameBuffer) => {
    const session = sessionRef.current;
    if (!session || !frameBuffer || frameBuffer.length !== SEQ_LEN) {
      return null;
    }

    const data = new Float32Array(SEQ_LEN * NUM_FEATURES);
    for (let i = 0; i < SEQ_LEN; i++) {
      for (let j = 0; j < NUM_FEATURES; j++) {
        data[i * NUM_FEATURES + j] = frameBuffer[i][j];
      }
    }

    const tensor = new ort.Tensor('float32', data, [1, SEQ_LEN, NUM_FEATURES]);
    const feeds = { [session.inputNames[0]]: tensor };
    const results = await session.run(feeds);
    const output = results[session.outputNames[0]];
    const logits = Array.from(output.data);

    const probs = softmax(logits);
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }

    return { gesture: LABEL_NAMES[bestIdx], confidence: probs[bestIdx] };
  }, []);

  return { isModelReady, modelError, runInference };
}
