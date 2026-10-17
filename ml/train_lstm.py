"""
Train an LSTM gesture classifier on synthetic (+ optionally recorded) hand
landmark sequences, then export it to ONNX for in-browser inference via
onnxruntime-web.
"""
import json
import os

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNTHETIC_PATH = os.path.join(SCRIPT_DIR, "synthetic_data.json")
RECORDED_PATH = os.path.join(SCRIPT_DIR, "recorded_data.json")
LABEL_MAP_PATH = os.path.join(SCRIPT_DIR, "label_map.json")
ONNX_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "public", "models")
ONNX_OUTPUT_PATH = os.path.join(ONNX_OUTPUT_DIR, "gesture_model.onnx")

NUM_FEATURES = 42
SEQ_LEN = 15
NUM_CLASSES = 6
LABEL_NAMES = ["REST", "LEFT", "RIGHT", "UP", "DOWN", "SELECT"]

EPOCHS = 60
BATCH_SIZE = 32
LEARNING_RATE = 0.001


class GestureLSTM(nn.Module):
    def __init__(self, input_size=NUM_FEATURES, hidden_size=128, num_layers=2, num_classes=NUM_CLASSES, dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout,
            batch_first=True,
        )
        self.fc = nn.Linear(hidden_size, num_classes)

    def forward(self, x):
        _, (hidden, _) = self.lstm(x)
        last_hidden = hidden[-1]
        return self.fc(last_hidden)


def load_dataset():
    with open(SYNTHETIC_PATH, "r") as f:
        data = json.load(f)
    samples = list(data["samples"])
    labels = list(data["labels"])

    if os.path.exists(RECORDED_PATH):
        with open(RECORDED_PATH, "r") as f:
            recorded = json.load(f)
        samples.extend(recorded["samples"])
        labels.extend(recorded["labels"])
        print(f"Merged {len(recorded['samples'])} recorded samples into the training set")

    return np.array(samples, dtype=np.float32), np.array(labels, dtype=np.int64)


def split_train_val(X, y, val_fraction=0.2, seed=42):
    rng = np.random.RandomState(seed)
    indices = rng.permutation(len(X))
    split = int(len(X) * (1 - val_fraction))
    train_idx, val_idx = indices[:split], indices[split:]
    return X[train_idx], y[train_idx], X[val_idx], y[val_idx]


def compute_accuracy(model, loader, device):
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for X_batch, y_batch in loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            logits = model(X_batch)
            preds = torch.argmax(logits, dim=1)
            correct += (preds == y_batch).sum().item()
            total += y_batch.size(0)
    return correct / total if total > 0 else 0.0


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    X, y = load_dataset()
    X_train, y_train, X_val, y_val = split_train_val(X, y)

    train_dataset = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train))
    val_dataset = TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y_val))
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    model = GestureLSTM().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    for epoch in range(1, EPOCHS + 1):
        model.train()
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)

            optimizer.zero_grad()
            logits = model(X_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            optimizer.step()

        if epoch % 10 == 0 or epoch == EPOCHS:
            train_acc = compute_accuracy(model, train_loader, device)
            val_acc = compute_accuracy(model, val_loader, device)
            print(f"Epoch {epoch}/{EPOCHS} - train_acc: {train_acc:.4f} - val_acc: {val_acc:.4f}")

    final_val_acc = compute_accuracy(model, val_loader, device)

    os.makedirs(ONNX_OUTPUT_DIR, exist_ok=True)

    model.eval().to("cpu")
    dummy_input = torch.randn(1, SEQ_LEN, NUM_FEATURES)
    torch.onnx.export(
        model,
        dummy_input,
        ONNX_OUTPUT_PATH,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        dynamo=False,
    )

    label_map = {str(idx): name for idx, name in enumerate(LABEL_NAMES)}
    with open(LABEL_MAP_PATH, "w") as f:
        json.dump(label_map, f, indent=2)

    print(f"Final validation accuracy: {final_val_acc:.4f}")
    print(f"ONNX model exported to: {os.path.abspath(ONNX_OUTPUT_PATH)}")
    print(f"Label map saved to: {LABEL_MAP_PATH}")


if __name__ == "__main__":
    main()
