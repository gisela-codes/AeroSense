#!/usr/bin/env python3

################################################################
#
# These custom functions help with constructing common pipelines.
# They make use of my_args, and object that has been configured
# by the argparse module to match user requests.
#
from pipeline_elements import *
import sklearn.impute
import sklearn.preprocessing
import sklearn.pipeline
import sklearn.linear_model
import sklearn.svm
import sklearn.ensemble
import sklearn.tree
from sklearn.metrics import classification_report
from joblib import dump

def make_numerical_predictor_params(my_args):
    params = { 
        "features__numerical__numerical-features-only__do_predictors" : [ True ],
        "features__numerical__numerical-features-only__do_numerical" : [ True ],
    }
    if my_args.numerical_missing_strategy:
        params["features__numerical__missing-data__strategy"] = [ 'median', 'mean', 'most_frequent' ]
    if my_args.use_polynomial_features:
        params["features__numerical__polynomial-features__degree"] = [ 2 ] # [ 1, 2, 3 ]

    return params

def make_categorical_predictor_params(my_args):
    selector = DataFrameSelector(do_predictors=True, do_numerical=False)
    if not selector.mAttributes:
        return {}
    params = { 
        "features__categorical__categorical-features-only__do_predictors" : [ True ],
        "features__categorical__categorical-features-only__do_numerical" : [ False ],
        "features__categorical__encode-category-bits__categories": [ 'auto' ],
        "features__categorical__encode-category-bits__handle_unknown": [ 'ignore' ],
    }
    if my_args.categorical_missing_strategy:
        params["features__categorical__missing-data__strategy"] = [ 'most_frequent' ]
    return params

def make_predictor_params(my_args):
    p1 = make_numerical_predictor_params(my_args)
    p2 = make_categorical_predictor_params(my_args)
    p1.update(p2)
    return p1
def make_SVM_params(my_args):
    svm_params = {
    "model__C": [1], #[0.1, 1, 10, 100], 
    "model__kernel": ["rbf"], #["rbf", "poly", "sigmoid"], 
    "model__degree": [1], #[2, 3],  
    }

    return svm_params
def make_boost_params(my_args):
    boost_params = {
        "model__loss": ["log_loss"],  
        "model__learning_rate": [0.01, 0.05, 0.1, 0.2, 0.3],  
        "model__n_estimators": [50, 100, 200, 500],  
        "model__subsample": [0.6, 0.7, 0.8, 1.0],  
        "model__min_samples_split": [2, 5, 10, 20],  
        "model__min_samples_leaf": [1, 2, 5, 10],  
        "model__max_depth": [3, 5, 7, 10, None], 
        "model__init": [None], 
        "model__random_state": [None], 
        "model__max_features": [None],  
        "model__verbose": [0],
        "model__max_leaf_nodes": [None],  
        "model__warm_start": [False],  
        "model__validation_fraction": [0.1],  
        "model__n_iter_no_change": [None],  
        "model__tol": [0.0001], 
        "model__ccp_alpha": [0.0]  
    }

    return boost_params
def make_tree_params(my_args):
    tree_params = {
        "model__criterion": [ "entropy" ], # [ "entropy", "gini" ],
        "model__splitter": [ "best" ], # [ "best", "random" ],
        "model__max_depth": [ 1, 2, 3, 4, None ],
        "model__min_samples_split": [ 2 ], # [ 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64 ],
        "model__min_samples_leaf":  [ 1 ],  # [ 0.01, 0.02, 0.04, 0.1 ],
        "model__max_features":  [ None ], # [ "sqrt", "log2", None ],
        "model__max_leaf_nodes": [ None ], # [ 2, 4, 8, 16, 32, 64, None ],
        "model__min_impurity_decrease": [ 0.0 ], # [ 0.0, 0.01, 0.02, 0.04, 0.1, 0.2 ],
    }
    return tree_params

def make_fit_params(my_args):
    params = make_predictor_params(my_args)
    if my_args.model_type == "SGD":
        model_params = make_SGD_params(my_args)
    elif my_args.model_type == "linear":
        model_params = make_linear_params(my_args)
    elif my_args.model_type == "SVM":
        model_params = make_SVM_params(my_args)
    elif my_args.model_type == "boost":
        model_params = make_boost_params(my_args)
    elif my_args.model_type == "forest":
        model_params = make_forest_params(my_args)
    elif my_args.model_type == "tree":
        model_params = make_tree_params(my_args)
    else:
        raise Exception("Unknown model type: {} [SGD, linear, SVM, boost, forest]".format(my_args.model_type))

    params.update(model_params)
    return params

def make_numerical_feature_pipeline(my_args):
    items = []

    items.append(("numerical-features-only", DataFrameSelector(do_predictors=True, do_numerical=True)))

    if my_args.numerical_missing_strategy:
        items.append(("missing-data", sklearn.impute.SimpleImputer(strategy=my_args.numerical_missing_strategy)))
    if my_args.use_polynomial_features:
        items.append(("polynomial-features", sklearn.preprocessing.PolynomialFeatures(degree=my_args.use_polynomial_features)))
    if my_args.use_scaler:
        items.append(("scaler", sklearn.preprocessing.StandardScaler()))
    items.append(("noop", PipelineNoop()))
    
    numerical_pipeline = sklearn.pipeline.Pipeline(items)
    return numerical_pipeline


def make_categorical_feature_pipeline(my_args):
    items = []
    
    selector = DataFrameSelector(do_predictors=True, do_numerical=False)
    if not selector.mAttributes:
        return None

    items.append(("categorical-features-only", selector))

    if my_args.categorical_missing_strategy:
        items.append(("missing-data", sklearn.impute.SimpleImputer(strategy=my_args.categorical_missing_strategy)))
    items.append(("encode-category-bits", sklearn.preprocessing.OneHotEncoder(categories='auto', handle_unknown='ignore')))

    categorical_pipeline = sklearn.pipeline.Pipeline(items)
    return categorical_pipeline

def make_feature_pipeline(my_args):
    """
    Numerical features and categorical features are usually preprocessed
    differently. We split them out here, preprocess them, then merge
    the preprocessed features into one group again.
    """
    items = []

    items.append(("numerical", make_numerical_feature_pipeline(my_args)))
    categorical_pipeline = make_categorical_feature_pipeline(my_args)
    if categorical_pipeline is not None:
        items.append(("categorical", categorical_pipeline))
    pipeline = sklearn.pipeline.FeatureUnion(transformer_list=items)
    return pipeline


def make_fit_pipeline_regression(my_args):
    """
    These are all regression models.
    """
    items = []
    items.append(("features", make_feature_pipeline(my_args)))
    if my_args.model_type == "SGD":
        items.append(("model", sklearn.linear_model.SGDRegressor(max_iter=10000, n_iter_no_change=100, penalty=None))) # verbose=3, 
    elif my_args.model_type == "linear":
        items.append(("model", sklearn.linear_model.LinearRegression()))
    elif my_args.model_type == "SVM":
        items.append(("model", sklearn.svm.SVR()))
    elif my_args.model_type == "boost":
        items.append(("model", sklearn.ensemble.GradientBoostingRegressor()))
    elif my_args.model_type == "forest":
        items.append(("model", sklearn.ensemble.RandomForestRegressor()))
    elif my_args.model_type == "tree":
        items.append(("model", sklearn.tree.DecisionTreeRegressor()))

    else:
        raise Exception("Unknown model type: {} [SGD, linear, SVM, boost, forest, tree]".format(my_args.model_type))

    return sklearn.pipeline.Pipeline(items)

def make_fit_pipeline_classification(my_args):
    """
    These are all classification models.
    """
    items = []
    items.append(("features", make_feature_pipeline(my_args)))
    if my_args.model_type == "SGD":
        items.append(("model", sklearn.linear_model.SGDClassifier(max_iter=10000, n_iter_no_change=100, penalty=None))) # verbose=3, 
    elif my_args.model_type == "linear":
        items.append(("model", sklearn.linear_model.RidgeClassifier()))
    elif my_args.model_type == "logistic":
        items.append(("model", sklearn.linear_model.LogisticRegression(max_iter=10000, solver='lbfgs', class_weight='balanced' )))
    elif my_args.model_type == "SVM":
        # items.append(("model", sklearn.svm.SVC(probability=True)))
        items.append(("model", sklearn.svm.SVC(probability=True, class_weight='balanced' )))
    elif my_args.model_type == "boost":
        items.append(("model", sklearn.ensemble.GradientBoostingClassifier()))
    elif my_args.model_type == "forest":
        items.append(("model", sklearn.ensemble.RandomForestClassifier()))
    elif my_args.model_type == "tree":
        items.append(("model", sklearn.tree.DecisionTreeClassifier()))
        #Best params
        # items.append(("model", sklearn.tree.DecisionTreeClassifier(criterion='entropy',max_depth=4,max_features=None,max_leaf_nodes=None,min_impurity_decrease=0.0,min_samples_leaf=1,min_samples_split=2,splitter='best')))

    else:
        raise Exception("Unknown model type: {} [SGD, linear, logistic, SVM, boost, forest, tree]".format(my_args.model_type))

    return sklearn.pipeline.Pipeline(items)

def make_fit_pipeline(my_args):
    return make_fit_pipeline_classification(my_args)
