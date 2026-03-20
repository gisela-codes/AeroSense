from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
LABEL_COLUMN = "activity"


def load_all_data() -> pd.DataFrame:
    frames = []

    # Assume filenames like "running-gisela-01.csv"
    for path in sorted(DATA_DIR.glob("*.csv")):
        if not path.is_file():
            continue

        df = pd.read_csv(path)
        if df.empty:
            continue

        # Infer label from filename before first dash
        label = path.stem.split("-")[0]
        df = df.copy()
        df[LABEL_COLUMN] = label

        frames.append(df)

    if not frames:
        raise RuntimeError(f"No CSV files found in {DATA_DIR}")

    return pd.concat(frames, ignore_index=True)


def main():
    combined = load_all_data()

    X = combined.drop(columns=[LABEL_COLUMN])
    y = combined[LABEL_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    # Keep the separate X/y files for quick inspection
    X_train.to_csv("X_train.csv", index=False)
    X_test.to_csv("X_test.csv", index=False)
    y_train.to_csv("y_train.csv", index=False)
    y_test.to_csv("y_test.csv", index=False)

    # Also store combined train/test CSVs that pipeline.py expects.
    train_df = X_train.copy()
    train_df[LABEL_COLUMN] = y_train.values
    train_df.to_csv("train.csv", index=False)

    test_df = X_test.copy()
    test_df[LABEL_COLUMN] = y_test.values
    test_df.to_csv("test.csv", index=False)


if __name__ == "__main__":
    main()