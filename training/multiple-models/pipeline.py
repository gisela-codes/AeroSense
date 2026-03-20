#!/usr/bin/env python3

import sys
import argparse
import logging
import os.path
from pathlib import Path

import pandas as pd
import numpy as np
import sklearn.linear_model
import sklearn.preprocessing
import sklearn.pipeline
import sklearn.base
import sklearn.metrics
import sklearn.impute
import sklearn.svm
import sklearn.ensemble
from sklearn.metrics import accuracy_score

import joblib
import pprint
import matplotlib.pyplot as plt

from pipeline_elements import *
from data_overhead import *
from make_pipeline import *
from data_prep import prepare_datasets, plot_line_of_fit, SOURCE_COLUMN

BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = BASE_DIR / "data"

def do_fit(my_args):
    """
    fit pipeline to training data
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    pipeline = make_fit_pipeline(my_args)
    pipeline.fit(X, y)

    model_file = get_model_filename(my_args.model_file, train_file)

    joblib.dump(pipeline, model_file)

    return

def do_cross(my_args):
    """
    do cross validation with training data
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)

    cv_results = sklearn.model_selection.cross_validate(pipeline, X, y, cv=my_args.cv_count, n_jobs=-1, verbose=3, scoring=('r2', 'neg_mean_squared_error', 'neg_mean_absolute_error'),)
    # print(cv_results.keys())
    print("R2:", cv_results['test_r2'], cv_results['test_r2'].mean())
    print("MSE:", cv_results['test_neg_mean_squared_error'], cv_results['test_neg_mean_squared_error'].mean())
    print("MAE:", cv_results['test_neg_mean_absolute_error'], cv_results['test_neg_mean_absolute_error'].mean())

    # pipeline.fit(X, y)
    # model_file = get_model_filename(my_args.model_file, train_file)
    # joblib.dump(pipeline, model_file)
    return

def show_score(my_args):
    """
    shows the already trained  model's score on training data.
    also on the test data, if --show-test 1
    """

    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))
    
    test_file = get_test_filename(my_args.test_file, train_file)
    if not os.path.exists(test_file):
        raise Exception("testing data file, '{}', does not exist.".format(test_file))
    
    model_file = get_model_filename(my_args.model_file, train_file)
    if not os.path.exists(model_file):
        raise Exception("Model file, '{}', does not exist.".format(model_file))

    X_train, y_train = load_data(my_args, train_file)
    X_test, y_test = load_data(my_args, test_file)
    pipeline = joblib.load(model_file)
    regressor = pipeline['model']
    
    basename = get_basename(train_file)
    score_train = regressor.score(pipeline['features'].transform(X_train), y_train)
    if my_args.show_test:
        score_test = regressor.score(pipeline['features'].transform(X_test), y_test)
        test_score = accuracy_score(y_test, regressor.predict(pipeline['features'].transform(X_test)))
        print("{}: train_score: {} test_score: {}".format(basename, score_train, test_score))
    else:
        print("{}: train_score: {}".format(basename, score_train))
    return

def show_loss(my_args):
    """
    shows the already trained model's loss on training data.
    # commented out for Kaggle data
    # also on the test data if --show-test 1
    """

    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))
    
    # test_file = get_test_filename(my_args.test_file, train_file)
    # if not os.path.exists(test_file):
    #     raise Exception("testing data file, '{}', does not exist.".format(test_file))
    
    model_file = get_model_filename(my_args.model_file, train_file)
    if not os.path.exists(model_file):
        raise Exception("Model file, '{}', does not exist.".format(model_file))

    X_train, y_train = load_data(my_args, train_file)
    # commented out for Kaggle data
    # X_test, y_test = load_data(my_args, test_file)
    pipeline = joblib.load(model_file)

    y_train_predicted = pipeline.predict(X_train)
    # commented out for Kaggle data
    # y_test_predicted = pipeline.predict(X_test)

    basename = get_basename(train_file)
    
    loss_train = sklearn.metrics.mean_squared_error(y_train, y_train_predicted)
    # commented out for Kaggle data
    # if my_args.show_test:
    #     loss_test = sklearn.metrics.mean_squared_error(y_test, y_test_predicted)
    #     print("{}: L2(MSE) train_loss: {} test_loss: {}".format(basename, loss_train, loss_test))
    # else:
    print("{}: L2(MSE) train_loss: {}".format(basename, loss_train))

    loss_train = sklearn.metrics.mean_absolute_error(y_train, y_train_predicted)
    # commented out for Kaggle data
    # if my_args.show_test:
    #     loss_test = sklearn.metrics.mean_absolute_error(y_test, y_test_predicted)
    #     print("{}: L1(MAE) train_loss: {} test_loss: {}".format(basename, loss_train, loss_test))
    # else:
    print("{}: L1(MAE) train_loss: {}".format(basename, loss_train))

    loss_train = sklearn.metrics.r2_score(y_train, y_train_predicted)
    # commented out for Kaggle data
    # if my_args.show_test:
    #     loss_test = sklearn.metrics.r2_score(y_test, y_test_predicted)
    #     print("{}: R2 train_loss: {} test_loss: {}".format(basename, loss_train, loss_test))
    # else:
    print("{}: R2 train_loss: {}".format(basename, loss_train))
    return

def do_predict(my_args):
    """
    Do predictions on the test data using the already trained model.
    Writes the result to file. Designed for use with Kaggle competitions.
    """
    test_file = my_args.test_file
    if not os.path.exists(test_file):
        raise Exception("testing data file: {} does not exist.".format(test_file))

    model_file = get_model_filename(my_args.model_file, test_file)
    if not os.path.exists(model_file):
        raise Exception("Model file, '{}', does not exist.".format(model_file))

    X_test, y_test = load_data(my_args, test_file)
    pipeline = joblib.load(model_file)

    y_test_predicted = pipeline.predict(X_test)

    merged = X_test.index.to_frame()
    merged[my_args.label] = y_test_predicted
    merged.to_csv("predictions.csv", index=False)

    return

def do_proba(my_args):
    """
    Do predictions on the test data using the already trained model.
    Writes the result to file. Designed for use with Kaggle competitions.
    """
    test_file = my_args.test_file
    if not os.path.exists(test_file):
        raise Exception("testing data file: {} does not exist.".format(test_file))

    model_file = get_model_filename(my_args.model_file, test_file)
    if not os.path.exists(model_file):
        raise Exception("Model file, '{}', does not exist.".format(model_file))

    X_test, y_test = load_data(my_args, test_file)
    pipeline = joblib.load(model_file)

    y_test_predicted = pipeline.predict_proba(X_test)

    merged = X_test.index.to_frame()
    merged[my_args.label] = y_test_predicted[:,1]
    merged.to_csv("predictions_proba.csv", index=False)

    return

def do_grid_search(my_args):
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)
    fit_params = make_fit_params(my_args)

    search_grid = sklearn.model_selection.GridSearchCV(pipeline, fit_params,
                                                       scoring="f1_micro",
                                                       cv=my_args.cv_count,
                                                       n_jobs=-1, verbose=1)
    search_grid.fit(X, y)

    search_grid_file = get_search_grid_filename(my_args.search_grid_file, train_file)
    joblib.dump(search_grid, search_grid_file)

    model_file = get_model_filename(my_args.model_file, train_file)
    joblib.dump(search_grid.best_estimator_, model_file)

    return

def do_random_search(my_args):
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)
    fit_params = make_fit_params(my_args)

    search_grid = sklearn.model_selection.RandomizedSearchCV(pipeline, fit_params,
                                                             scoring="f1_micro",
                                                             cv=my_args.cv_count,
                                                             n_jobs=-1, verbose=1,
                                                             n_iter=my_args.n_search_iterations)
    search_grid.fit(X, y)
    
    search_grid_file = get_search_grid_filename(my_args.search_grid_file, train_file)
    joblib.dump(search_grid, search_grid_file)

    model_file = get_model_filename(my_args.model_file, train_file)
    joblib.dump(search_grid.best_estimator_, model_file)

    return

def show_best_params(my_args):

    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))
    
    test_file = get_test_filename(my_args.test_file, train_file)
    if not os.path.exists(test_file):
        raise Exception("testing data file, '{}', does not exist.".format(test_file))
    
    search_grid_file = get_search_grid_filename(my_args.search_grid_file, train_file)
    if not os.path.exists(search_grid_file):
        raise Exception("Search grid file, '{}', does not exist.".format(search_grid_file))


    search_grid = joblib.load(search_grid_file)

    pp = pprint.PrettyPrinter(indent=4)
    print("Best Score:", search_grid.best_score_)
    print("Best Params:")
    pp.pprint(search_grid.best_params_)

    return


def do_cross_score(my_args):
    """
    do cross validation scoring with training data
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)

    # scoring="accuracy" is a classification metric.
    # scoring="r2" is a regression metric.
    # https://scikit-learn.org/stable/modules/model_evaluation.html#scoring-parameter
    score = sklearn.model_selection.cross_val_score(pipeline, X, y, cv=my_args.cv_count, n_jobs=-1, scoring="accuracy")
    print("Cross Validation Score: {:.3f} : {}".format(score.mean(), ["{:.3f}".format(x) for x in score]))

    return

from cm_display import print_cm

def save_confusion_matrix_plot(cm, labels, image_file, title="Confusion Matrix"):
    image_path = Path(image_file).expanduser()
    image_path.parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(6, 5))
    disp = sklearn.metrics.ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    disp.plot(ax=ax, cmap=plt.cm.Blues, colorbar=True)
    ax.set_title(title)
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    fig.savefig(image_path)
    plt.close(fig)
    print(f"Confusion matrix figure saved to {image_path}")


def do_confusion_matrix(my_args):
    """
    do cross validation and show confusion matrix
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)

    y_pred = sklearn.model_selection.cross_val_predict(pipeline, X, y, cv=my_args.cv_count, n_jobs=-1)
    cm = sklearn.metrics.confusion_matrix(y, y_pred)
    labels = sorted(pd.unique(y))
    print()
    print()
    print_cm(cm, labels)
    print()
    print()

    pscore = sklearn.metrics.precision_score(y, y_pred, average="weighted", zero_division=0)
    rscore = sklearn.metrics.recall_score(y, y_pred, average="weighted", zero_division=0)
    f1score = sklearn.metrics.f1_score(y, y_pred, average="weighted", zero_division=0)

    print("Precision: {:.3f}".format(pscore))
    print("Recall:    {:.3f}".format(rscore))
    print("F1:        {:.3f}".format(f1score))

    if my_args.image_file:
        save_confusion_matrix_plot(
            cm,
            labels,
            my_args.image_file,
            title=f"{my_args.model_type} Confusion Matrix",
        )

    return


def do_precision_recall_plot(my_args):
    """
    plot the precision-recall curve
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)

    y_pred = sklearn.model_selection.cross_val_predict(
        pipeline,
        X,
        y,
        cv=my_args.cv_count,
        n_jobs=-1,
        method=my_args.cross_val_predict_method,
    )

    classes = np.unique(y)
    scores = np.asarray(y_pred)

    if len(classes) <= 2:
        if scores.ndim == 2:
            # take the positive class column
            pos_label = classes[-1]
            pos_index = list(classes).index(pos_label)
            scores = scores[:, pos_index]
        precisions, recalls, thresholds = sklearn.metrics.precision_recall_curve(
            (y == classes[-1]).astype(int), scores
        )

        numerator = 2 * recalls * precisions
        denom = recalls + precisions
        f1_scores = np.divide(numerator, denom, out=np.zeros_like(denom), where=(denom != 0))
        max_f1 = np.max(f1_scores)
        max_f1_thresh = thresholds[np.argmax(f1_scores)]

        plt.plot(thresholds, precisions[:-1], "b--", label="Precision", linewidth=2)
        plt.plot(thresholds, recalls[:-1], "g-", label="Recall", linewidth=2)
        plt.vlines(max_f1_thresh, 0, 1.0, "k", "dotted", label="max f1 {:.3f}".format(max_f1))
    else:
        if scores.ndim != 2 or scores.shape[1] != len(classes):
            raise Exception(
                "Multi-class precision/recall plot needs probability or decision scores for each class."
            )
        y_bin = sklearn.preprocessing.label_binarize(y, classes=classes)
        precisions, recalls, thresholds = sklearn.metrics.precision_recall_curve(
            y_bin.ravel(), scores.ravel()
        )

        numerator = 2 * recalls * precisions
        denom = recalls + precisions
        f1_scores = np.divide(numerator, denom, out=np.zeros_like(denom), where=(denom != 0))
        max_f1 = np.max(f1_scores)
        max_f1_thresh = thresholds[np.argmax(f1_scores)]

        plt.plot(
            thresholds,
            precisions[:-1],
            "b--",
            label="Precision (micro)",
            linewidth=2,
        )
        plt.plot(
            thresholds,
            recalls[:-1],
            "g-",
            label="Recall (micro)",
            linewidth=2,
        )
        plt.vlines(
            max_f1_thresh,
            0,
            1.0,
            "k",
            "dotted",
            label="max micro f1 {:.3f}".format(max_f1),
        )

    plt.title(my_args.model_type + " Precision+Recall vs Threshold")
    plt.xlabel("Threshold")
    plt.grid(True)
    plt.legend()
    plt.savefig(my_args.image_file)
    plt.clf()


    return

def do_precision_recall_curve(my_args):
    """
    plot the precision-recall curve
    """
    train_file = my_args.train_file
    if not os.path.exists(train_file):
        raise Exception("training data file: {} does not exist.".format(train_file))

    X, y = load_data(my_args, train_file)
    
    pipeline = make_fit_pipeline(my_args)

    y_pred = sklearn.model_selection.cross_val_predict(
        pipeline,
        X,
        y,
        cv=my_args.cv_count,
        n_jobs=-1,
        method=my_args.cross_val_predict_method,
    )

    classes = np.unique(y)
    scores = np.asarray(y_pred)

    if len(classes) <= 2:
        if scores.ndim == 2:
            pos_label = classes[-1]
            pos_index = list(classes).index(pos_label)
            scores = scores[:, pos_index]
        precisions, recalls, thresholds = sklearn.metrics.precision_recall_curve(
            (y == classes[-1]).astype(int), scores
        )

        numerator = 2 * recalls * precisions
        denom = recalls + precisions
        f1_scores = np.divide(numerator, denom, out=np.zeros_like(denom), where=(denom != 0))
        max_idx = np.argmax(f1_scores)
        max_f1 = f1_scores[max_idx]
        max_f1_precision = precisions[max_idx]
        max_f1_recall = recalls[max_idx]

        plt.plot(recalls, precisions, linewidth=2, label="Precision/Recall curve")
        plt.vlines(max_f1_recall, 0, max_f1_precision, "k", "dotted", label="max f1 {:.3f}".format(max_f1))
        plt.hlines(max_f1_precision, 0, max_f1_recall, "k", "dotted")
    else:
        if scores.ndim != 2 or scores.shape[1] != len(classes):
            raise Exception(
                "Multi-class PR curve requires probability or decision scores for each class."
            )

        y_bin = sklearn.preprocessing.label_binarize(y, classes=classes)
        cmap = plt.cm.get_cmap("tab10", len(classes))

        for idx, label in enumerate(classes):
            precision_i, recall_i, _ = sklearn.metrics.precision_recall_curve(
                y_bin[:, idx], scores[:, idx]
            )
            plt.plot(recall_i, precision_i, label=f"{label}", color=cmap(idx))

        micro_precision, micro_recall, _ = sklearn.metrics.precision_recall_curve(
            y_bin.ravel(), scores.ravel()
        )
        plt.plot(
            micro_recall,
            micro_precision,
            label="micro-average",
            color="black",
            linewidth=2,
            linestyle="--",
        )

    plt.title(my_args.model_type + " Precision/Recall")
    plt.ylabel("Precision")
    plt.xlabel("Recall")
    plt.grid(True)
    plt.legend()
    plt.savefig(my_args.image_file)
    plt.clf()


    return


def prepare_data_action(my_args):
    """Combine raw sensor files, build sliding-window features, and plot a line of fit."""

    data_dir = Path(my_args.raw_data_dir).expanduser()
    if not data_dir.exists():
        raise Exception(f"Raw data directory '{data_dir}' does not exist.")

    combined_output = Path(my_args.combined_file).expanduser() if my_args.combined_file else None
    window_output_path = Path(my_args.train_file or "windowed_train.csv").expanduser()
    if my_args.window_test_file:
        window_test_path = Path(my_args.window_test_file).expanduser()
    else:
        window_test_path = Path(get_test_filename("", str(window_output_path)))

    _, window_df = prepare_datasets(
        data_dir=data_dir,
        combined_output=combined_output,
        window_output=None,
        window_seconds=my_args.window_seconds,
        sampling_rate=my_args.sampling_rate,
        overlap=my_args.window_overlap,
    )

    if not len(window_df):
        raise Exception("No sliding windows were generated; adjust window parameters or provide longer recordings.")

    stratify_labels = window_df["activity"] if window_df["activity"].nunique() > 1 else None
    train_df, test_df = sklearn.model_selection.train_test_split(
        window_df,
        test_size=my_args.window_test_size,
        random_state=my_args.window_random_state,
        stratify=stratify_labels,
    )

    window_output_path.parent.mkdir(parents=True, exist_ok=True)
    train_df.to_csv(window_output_path, index=False)

    window_test_path.parent.mkdir(parents=True, exist_ok=True)
    test_df.to_csv(window_test_path, index=False)

    print(
        f"Prepared {len(train_df)} train windows and {len(test_df)} test windows across {window_df[SOURCE_COLUMN].nunique()} sessions."
    )
    print(f"Train windows saved to {window_output_path}")
    print(f"Test windows saved to {window_test_path}")

    window_df_for_plot = train_df if len(train_df) else window_df

    feature = my_args.line_fit_feature
    if feature not in window_df_for_plot.columns:
        fallback_feature = "accel_mag_mean"
        print(
            f"Feature '{feature}' not found. Falling back to '{fallback_feature}' for line-of-fit plot."
        )
        feature = fallback_feature
        if feature not in window_df_for_plot.columns:
            raise Exception(
                f"Neither '{my_args.line_fit_feature}' nor '{fallback_feature}' exist in the prepared dataset."
            )

    image_path = Path(my_args.image_file).expanduser()
    slope, intercept = plot_line_of_fit(
        window_df_for_plot,
        feature_column=feature,
        image_file=image_path,
        title=f"{feature} line of fit",
    )
    print(
        f"Saved line-of-fit plot for '{feature}' to {image_path} (slope={slope:.4f}, intercept={intercept:.4f})"
    )


def parse_args(argv):
    parser = argparse.ArgumentParser(prog=argv[0], description='Fit Data Using Pipeline',
                                     formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('action', default='fit',
                        choices=[ "fit", "score", "loss", "cross", "predict", "grid-search", "show-best-params", "random-search",
                                  "cross-score", "confusion-matrix", "precision-recall-plot", "pr-curve", "prepare-data" ], 
                        nargs='?', help="desired action")
    parser.add_argument('--model-type',    '-M', default="SGD", type=str,   choices=["SGD", "linear","logistic", "SVM", "boost", "forest", "tree"], help="Model type")
    parser.add_argument('--train-file',    '-t', default="",    type=str,   help="name of file with training data")
    parser.add_argument('--test-file',     '-T', default="",    type=str,   help="name of file with test data (default is constructed from train file name)")
    parser.add_argument('--model-file',    '-m', default="",    type=str,   help="name of file for the model (default is constructed from train file name when fitting)")
    parser.add_argument('--search-grid-file', '-g', default="", type=str,   help="name of file for the search grid (default is constructed from train file name when fitting)")
    parser.add_argument('--random-seed',   '-R', default=314159265,type=int,help="random number seed (-1 to use OS entropy)")
    parser.add_argument('--features',      '-f', default=None, action="extend", nargs="+", type=str,
                        help="column names for features")
    parser.add_argument('--label',         '-l', default="activity",   type=str,   help="column name for label")
    parser.add_argument('--use-polynomial-features', '-p', default=0,         type=int,   help="degree of polynomial features.  0 = don't use (default=0)")
    parser.add_argument('--use-scaler',    '-s', default=0,         type=int,   help="0 = don't use scaler, 1 = do use scaler (default=0)")
    parser.add_argument('--categorical-missing-strategy', default="",   type=str, choices=("", "most_frequent"), help="strategy for missing categorical information")
    parser.add_argument('--numerical-missing-strategy', default="",   type=str,  choices=("", "mean", "median", "most_frequent"), help="strategy for missing numerical information")
    parser.add_argument('--show-test',     '-S', default=0,         type=int,   help="0 = don't show test loss, 1 = do show test loss (default=0)")
    parser.add_argument('--n-search-iterations', default=10,        type=int,   help="number of random iterations in randomized grid search.")
    parser.add_argument('--cv-count',            default=3,         type=int,   help="number of partitions for cross validation.")
    parser.add_argument('--raw-data-dir',        default=str(DEFAULT_DATA_DIR), type=str,   help="Directory containing minute-long activity CSVs for prepare-data action")
    parser.add_argument('--combined-file',       default="combined_raw.csv", type=str,   help="Output CSV for concatenated raw data when running prepare-data (set to '' to skip)")
    parser.add_argument('--window-seconds',      default=2.0,       type=float, help="Sliding window size in seconds for prepare-data")
    parser.add_argument('--sampling-rate',       default=50.0,      type=float, help="Sampling rate (Hz) used to convert seconds to samples")
    parser.add_argument('--window-overlap',      default=0.5,       type=float, help="Fractional overlap between consecutive windows [0, 1)")
    parser.add_argument('--window-test-file',    default="",       type=str,   help="Output CSV for the windowed test split (default derives from train file)")
    parser.add_argument('--window-test-size',    default=0.2,       type=float, help="Proportion of windowed data reserved for testing")
    parser.add_argument('--window-random-state', default=42,        type=int,   help="Random seed used when splitting windowed data")
    parser.add_argument('--image-file',          default="image.png", type=str,   help="name of file to store output images")
    parser.add_argument('--line-fit-feature',    default="accel_mag_mean", type=str, help="Feature column to visualize with the line of fit plot")
    parser.add_argument('--cross-val-predict-method', default="", type=str,   help="method argument for cross_val_predict, will be determined by model-type")

    my_args = parser.parse_args(argv[1:])

    
    if my_args.model_type in ("SGD", "linear"):
        my_args.cross_val_predict_method = "decision_function"
    elif my_args.model_type in ("SVM", "logistic", "boost", "forest", "tree"):
        my_args.cross_val_predict_method = "predict_proba"
    else:
        raise Exception("???")

    return my_args

def main(argv):
    my_args = parse_args(argv)
    # logging.basicConfig(level=logging.INFO)
    logging.basicConfig(level=logging.WARN)

    if my_args.action == 'fit':
        do_fit(my_args)
    elif my_args.action == "score":
        show_score(my_args)
    elif my_args.action == "loss":
        show_loss(my_args)
    elif my_args.action == "cross":
        do_cross(my_args)
    elif my_args.action == "predict":
        do_predict(my_args)
    elif my_args.action == 'grid-search':
        do_grid_search(my_args)
    elif my_args.action == 'random-search':
        do_random_search(my_args)
    elif my_args.action == "show-best-params":
        show_best_params(my_args)
    elif my_args.action == "cross-score":
        do_cross_score(my_args)
    elif my_args.action == "confusion-matrix":
        do_confusion_matrix(my_args)
    elif my_args.action == "precision-recall-plot":
        do_precision_recall_plot(my_args)
    elif my_args.action == "pr-curve":
        do_precision_recall_curve(my_args)
    elif my_args.action == "prepare-data":
        prepare_data_action(my_args)
    else:
        raise Exception("Action: {} is not known.".format(my_args.action))
        
    return

if __name__ == "__main__":
    main(sys.argv)
    
