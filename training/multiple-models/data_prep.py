"""Utilities for preparing windowed activity datasets and diagnostic plots."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Tuple

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

IMU_COLUMNS: Tuple[str, ...] = (
    "AccelX",
    "AccelY",
    "AccelZ",
    "GyroX",
    "GyroY",
    "GyroZ",
)
LABEL_COLUMN = "activity"
SOURCE_COLUMN = "source_file"
TIME_SECONDS_COLUMN = "time_seconds"

__all__ = [
    "combine_activity_files",
    "build_window_dataset",
    "prepare_datasets",
    "plot_line_of_fit",
    "LABEL_COLUMN",
    "SOURCE_COLUMN",
]


def infer_label_from_filename(path: Path) -> str:
    """Infer activity label from filename prefix (e.g., running-gisela-01.csv -> running)."""

    return path.stem.split("-")[0].lower()


def _resolve_time_seconds(df: pd.DataFrame) -> pd.Series:
    """Return a Series in seconds derived from available time columns."""

    if "Time(s)" in df.columns:
        return df["Time(s)"].astype(float)
    if "Time(ms)" in df.columns:
        return df["Time(ms)"].astype(float) / 1000.0
    raise ValueError("Expected a 'Time(s)' or 'Time(ms)' column in raw data")


def _load_activity_file(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if df.empty:
        raise ValueError(f"File '{path}' is empty")

    df = df.copy()
    df[LABEL_COLUMN] = infer_label_from_filename(path)
    df[SOURCE_COLUMN] = path.name
    df[TIME_SECONDS_COLUMN] = _resolve_time_seconds(df)
    df = df.sort_values(TIME_SECONDS_COLUMN).reset_index(drop=True)
    return df


def combine_activity_files(data_dir: Path) -> pd.DataFrame:
    """Concatenate all CSV files in *data_dir* into a single labeled DataFrame."""

    frames: List[pd.DataFrame] = []
    for csv_path in sorted(data_dir.glob("*.csv")):
        if csv_path.is_file():
            frames.append(_load_activity_file(csv_path))

    if not frames:
        raise RuntimeError(f"No CSV files found in {data_dir}")

    return pd.concat(frames, ignore_index=True)


def _sliding_window_indices(length: int, window_size: int, step: int) -> Iterable[Tuple[int, int]]:
    for start in range(0, length - window_size + 1, step):
        yield start, start + window_size


def _summarize_window(df_window: pd.DataFrame, window_id: int) -> dict:
    features = {
        "window_index": window_id,
        "window_start_time": float(df_window[TIME_SECONDS_COLUMN].iloc[0]),
        "window_end_time": float(df_window[TIME_SECONDS_COLUMN].iloc[-1]),
        LABEL_COLUMN: df_window[LABEL_COLUMN].iloc[0],
        SOURCE_COLUMN: df_window[SOURCE_COLUMN].iloc[0],
    }

    for col in IMU_COLUMNS:
        values = df_window[col].astype(float).values
        features[f"{col}_mean"] = float(values.mean())
        features[f"{col}_std"] = float(values.std(ddof=0))
        features[f"{col}_min"] = float(values.min())
        features[f"{col}_max"] = float(values.max())

    accel_mag = np.linalg.norm(df_window[["AccelX", "AccelY", "AccelZ"]].values, axis=1)
    gyro_mag = np.linalg.norm(df_window[["GyroX", "GyroY", "GyroZ"]].values, axis=1)

    features.update(
        {
            "accel_mag_mean": float(accel_mag.mean()),
            "accel_mag_std": float(accel_mag.std(ddof=0)),
            "accel_mag_min": float(accel_mag.min()),
            "accel_mag_max": float(accel_mag.max()),
            "gyro_mag_mean": float(gyro_mag.mean()),
            "gyro_mag_std": float(gyro_mag.std(ddof=0)),
            "gyro_mag_min": float(gyro_mag.min()),
            "gyro_mag_max": float(gyro_mag.max()),
        }
    )

    return features


def build_window_dataset(
    combined_df: pd.DataFrame,
    *,
    window_seconds: float,
    sampling_rate: float,
    overlap: float,
) -> pd.DataFrame:
    """
    Convert labeled time-series data into overlapping sliding-window features.
    """

    if window_seconds <= 0:
        raise ValueError("window_seconds must be positive")
    if sampling_rate <= 0:
        raise ValueError("sampling_rate must be positive")
    if not (0 <= overlap < 1):
        raise ValueError("overlap must be in the range [0, 1)")

    samples_per_window = max(1, int(round(window_seconds * sampling_rate)))
    step = max(1, int(round(samples_per_window * (1.0 - overlap))))

    windows: List[dict] = []
    window_counter = 0

    for _, group in combined_df.groupby(SOURCE_COLUMN):
        group = group.reset_index(drop=True)
        if len(group) < samples_per_window:
            continue

        for start, end in _sliding_window_indices(len(group), samples_per_window, step):
            df_window = group.iloc[start:end]
            if len(df_window) < samples_per_window:
                continue
            windows.append(_summarize_window(df_window, window_counter))
            window_counter += 1

    if not windows:
        raise RuntimeError(
            "No sliding windows were generated. Increase recording length or lower window size."
        )

    return pd.DataFrame(windows)


def prepare_datasets(
    *,
    data_dir: Path,
    combined_output: Path | None,
    window_output: Path | None,
    window_seconds: float,
    sampling_rate: float,
    overlap: float,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Run the full prep pipeline and optionally persist intermediate outputs."""

    combined_df = combine_activity_files(data_dir)
    if combined_output is not None:
        combined_output.parent.mkdir(parents=True, exist_ok=True)
        combined_df.to_csv(combined_output, index=False)

    window_df = build_window_dataset(
        combined_df,
        window_seconds=window_seconds,
        sampling_rate=sampling_rate,
        overlap=overlap,
    )

    if window_output is not None:
        window_output.parent.mkdir(parents=True, exist_ok=True)
        window_df.to_csv(window_output, index=False)

    return combined_df, window_df


def plot_line_of_fit(
    window_df: pd.DataFrame,
    *,
    feature_column: str,
    image_file: Path,
    title: str | None = None,
) -> Tuple[float, float]:
    """Plot feature values with a least-squares best-fit line and save to disk."""

    if feature_column not in window_df.columns:
        raise ValueError(f"Feature '{feature_column}' not found in dataset columns")

    y = window_df[feature_column].astype(float).values
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    trend_line = slope * x + intercept

    plt.figure(figsize=(10, 5))
    plt.scatter(x, y, s=14, alpha=0.6, label=feature_column)
    plt.plot(x, trend_line, color="red", linewidth=2, label="Line of fit")
    plt.xlabel("Window index")
    plt.ylabel(feature_column)
    plt.title(title or f"{feature_column} trend")
    plt.grid(True, linestyle="--", linewidth=0.5, alpha=0.5)
    plt.legend()
    image_file.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(image_file)
    plt.close()

    return slope, intercept
