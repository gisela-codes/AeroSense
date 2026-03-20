import os
import glob
import re

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import joblib

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "activity_model.joblib")

IMU_COLS = ["AccelX", "AccelY", "AccelZ", "GyroX", "GyroY", "GyroZ"]

WINDOW_SECONDS = 2.0
WINDOW_OVERLAP = 0.5  # 50% overlap


def infer_label_from_filename(path: str) -> str:
    """
    Extract activity label from filename, e.g. 'running-gisela-01.csv' -> 'running'.
    """
    name = os.path.basename(path)
    # take the part before the first '-'
    label = name.split("-")[0]
    return label.lower()


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)

    time_col = "Time(ms)"

    if time_col is None:
        raise ValueError(f"No time column found in {path}. Columns: {list(df.columns)}")

    # ensure sorted by time
    df = df.sort_values(time_col).reset_index(drop=True)

    # check IMU columns
    missing = [c for c in IMU_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing IMU columns {missing} in {path} (have {list(df.columns)})")

    return df, time_col


def window_indices(time_vals: np.ndarray, window_seconds: float, overlap: float):
    """
    Given an array of time values in seconds, yield (start_idx, end_idx) for each window.
    """
    t_start = time_vals[0]
    t_end = time_vals[-1]
    step = window_seconds * (1.0 - overlap)

    current_start_time = t_start
    while current_start_time + window_seconds <= t_end:
        current_end_time = current_start_time + window_seconds
        # indices for this time range
        mask = (time_vals >= current_start_time) & (time_vals < current_end_time)
        idx = np.where(mask)[0]
        if len(idx) > 0:
            yield idx[0], idx[-1] + 1
        current_start_time += step


def extract_features_from_window(df_window: pd.DataFrame) -> np.ndarray:
    """
    Compute simple summary features for one window: mean, std, min, max per axis
    + magnitude stats for accel and gyro.
    """
    feats = []

    # basic stats per raw axis
    for col in IMU_COLS:
        vals = df_window[col].values
        feats.extend([
            np.mean(vals),
            np.std(vals),
            np.min(vals),
            np.max(vals),
        ])

    # accel magnitude
    acc_mag = np.sqrt(
        df_window["AccelX"]**2 + df_window["AccelY"]**2 + df_window["AccelZ"]**2
    )
    feats.extend([
        np.mean(acc_mag),
        np.std(acc_mag),
        np.min(acc_mag),
        np.max(acc_mag),
    ])

    # gyro magnitude
    gyro_mag = np.sqrt(
        df_window["GyroX"]**2 + df_window["GyroY"]**2 + df_window["GyroZ"]**2
    )
    feats.extend([
        np.mean(gyro_mag),
        np.std(gyro_mag),
        np.min(gyro_mag),
        np.max(gyro_mag),
    ])

    return np.array(feats, dtype=np.float32)


def build_dataset():
    """
    Load all CSVs, create windowed feature dataset X and label vector y.
    """
    pattern = os.path.join(DATA_DIR, "*.csv")
    paths = sorted(glob.glob(pattern))
    if not paths:
        raise RuntimeError(f"No CSV files found in {DATA_DIR}")

    X_list = []
    y_list = []

    for path in paths:
        label = infer_label_from_filename(path)
        print(f"Processing {os.path.basename(path)} -> label '{label}'")

        df, time_col = load_csv(path)

        # convert time to seconds if needed
        t_vals = df[time_col].values.astype(float)
        # If in ms, you might want to divide by 1000. Heuristic: large numbers -> ms.
        if np.median(np.diff(t_vals)) > 1.0:  # crude check
            t_vals = t_vals / 1000.0

        for start_idx, end_idx in window_indices(t_vals, WINDOW_SECONDS, WINDOW_OVERLAP):
            df_w = df.iloc[start_idx:end_idx]
            if len(df_w) < 5:
                continue  # skip very tiny windows

            feats = extract_features_from_window(df_w)
            X_list.append(feats)
            y_list.append(label)

    X = np.vstack(X_list)
    y = np.array(y_list)
    print(f"Built dataset: X shape = {X.shape}, y shape = {y.shape}, classes = {np.unique(y)}")
    return X, y


def train_and_save_model():
    X, y = build_dataset()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        random_state=42,
        n_jobs=-1,
    )

    print("Training model...")
    clf.fit(X_train, y_train)

    print("Evaluating...")
    y_pred = clf.predict(X_test)
    print("Classification report:")
    print(classification_report(y_test, y_pred))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, y_pred))

    joblib.dump(clf, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


def save_combined_dataset(csv_path: str):
    """
    Build the windowed dataset from all CSVs in data/ and save as a single CSV
    with columns feature_0, feature_1, ..., feature_N and a 'label' column.
    """
    X, y = build_dataset()
    n_features = X.shape[1]

    cols = [f"feature_{i}" for i in range(n_features)]
    df_out = pd.DataFrame(X, columns=cols)
    df_out["label"] = y

    df_out.to_csv(csv_path, index=False)
    print(f"Saved combined dataset to {csv_path}")


if __name__ == "__main__":
    train_and_save_model()