"""
Generate synthetic hand-landmark sequences for training the gesture LSTM.

Each sample: 15 frames x 42 values (21 MediaPipe hand landmarks, x & y only,
normalized to [0, 1] image coordinates where y=0 is the top of the frame).

Classes: REST=0, LEFT=1, RIGHT=2, UP=3, DOWN=4, SELECT=5
"""
import json
import numpy as np

np.random.seed(42)

NUM_FRAMES = 15
NUM_LANDMARKS = 21
SAMPLES_PER_CLASS = 300

LABELS = ["REST", "LEFT", "RIGHT", "UP", "DOWN", "SELECT"]
LABEL_TO_INDEX = {name: idx for idx, name in enumerate(LABELS)}

# Relative (dx, dy) offsets from the wrist (landmark 0) that approximate a
# flat, open hand facing the camera with fingers spread, fingers pointing
# "up" (toward smaller y). Index into this dict is the MediaPipe landmark id.
BASE_OFFSETS = {
    1: (-0.04, -0.02),
    2: (-0.07, -0.05),
    3: (-0.09, -0.09),
    4: (-0.11, -0.13),   # thumb tip
    5: (-0.02, -0.12),
    6: (-0.03, -0.18),
    7: (-0.035, -0.22),
    8: (-0.04, -0.26),   # index tip
    9: (0.0, -0.13),
    10: (0.0, -0.20),
    11: (0.0, -0.25),
    12: (0.0, -0.29),
    13: (0.02, -0.12),
    14: (0.025, -0.19),
    15: (0.03, -0.23),
    16: (0.035, -0.27),
    17: (0.04, -0.10),
    18: (0.05, -0.15),
    19: (0.055, -0.18),
    20: (0.06, -0.21),
}


def build_hand(wrist_x, wrist_y, scale=1.0):
    """Return a flat (42,) array of x,y pairs for all 21 landmarks given a wrist position."""
    coords = np.zeros((NUM_LANDMARKS, 2), dtype=np.float32)
    coords[0] = (wrist_x, wrist_y)
    for idx, (dx, dy) in BASE_OFFSETS.items():
        coords[idx] = (wrist_x + dx * scale, wrist_y + dy * scale)
    return coords


def add_noise(coords, std):
    return coords + np.random.normal(0, std, size=coords.shape).astype(np.float32)


def clip01(coords):
    return np.clip(coords, 0.0, 1.0)


def generate_rest_sample():
    scale = np.random.uniform(0.85, 1.15)
    frames = []
    for _ in range(NUM_FRAMES):
        wrist_x = 0.5 + np.random.normal(0, 0.005)
        wrist_y = 0.5 + np.random.normal(0, 0.005)
        coords = build_hand(wrist_x, wrist_y, scale)
        coords = add_noise(coords, std=0.01)
        frames.append(clip01(coords).flatten().tolist())
    return frames


def generate_directional_sample(axis, start, end):
    """axis='x' or 'y'; the wrist drifts linearly from start to end on that axis."""
    scale = np.random.uniform(0.85, 1.15)
    frames = []
    for i in range(NUM_FRAMES):
        t = i / (NUM_FRAMES - 1)
        drift = start + (end - start) * t
        if axis == "x":
            wrist_x, wrist_y = drift, 0.5
        else:
            wrist_x, wrist_y = 0.5, drift
        coords = build_hand(wrist_x, wrist_y, scale)
        coords = add_noise(coords, std=0.02)
        frames.append(clip01(coords).flatten().tolist())
    return frames


def generate_select_sample():
    scale = np.random.uniform(0.85, 1.15)
    wrist_x, wrist_y = 0.5, 0.5
    # Midpoint between thumb tip and index tip, and the direction along which
    # they converge (roughly matches their template positions above the wrist).
    mid_x, mid_y = wrist_x - 0.075, wrist_y - 0.22
    direction = np.array([0.6, -0.8])
    direction = direction / np.linalg.norm(direction)

    frames = []
    for i in range(NUM_FRAMES):
        t = i / (NUM_FRAMES - 1)
        dist = 0.15 + (0.01 - 0.15) * t

        jitter_wx = wrist_x + np.random.normal(0, 0.005)
        jitter_wy = wrist_y + np.random.normal(0, 0.005)
        coords = build_hand(jitter_wx, jitter_wy, scale)

        half = dist / 2.0
        thumb_tip = np.array([mid_x, mid_y]) - direction * half
        index_tip = np.array([mid_x, mid_y]) + direction * half
        coords[4] = thumb_tip
        coords[8] = index_tip

        coords = add_noise(coords, std=0.015)
        frames.append(clip01(coords).flatten().tolist())
    return frames


def main():
    samples = []
    labels = []

    generators = {
        "REST": lambda: generate_rest_sample(),
        "LEFT": lambda: generate_directional_sample("x", 0.5, 0.25),
        "RIGHT": lambda: generate_directional_sample("x", 0.5, 0.75),
        "UP": lambda: generate_directional_sample("y", 0.5, 0.2),
        "DOWN": lambda: generate_directional_sample("y", 0.5, 0.8),
        "SELECT": lambda: generate_select_sample(),
    }

    for label_name, generator in generators.items():
        label_idx = LABEL_TO_INDEX[label_name]
        for _ in range(SAMPLES_PER_CLASS):
            samples.append(generator())
            labels.append(label_idx)

    with open("synthetic_data.json", "w") as f:
        json.dump({"samples": samples, "labels": labels}, f)

    print(f"Generated {len(samples)} samples ({NUM_FRAMES} frames x 42 values each)")
    print("Class distribution:")
    for label_name in LABELS:
        label_idx = LABEL_TO_INDEX[label_name]
        count = labels.count(label_idx)
        print(f"  {label_name} ({label_idx}): {count}")
    print("Saved to ml/synthetic_data.json")


if __name__ == "__main__":
    main()
