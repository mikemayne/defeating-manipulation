"""Compare headline-only predictions with blocked, out-of-sample baselines."""

from datetime import date
import json
import sys

import numpy as np
from scipy.stats import spearmanr
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MultiLabelBinarizer, normalize


source, target = sys.argv[1:]
with open(source, encoding='utf8') as file:
    data = json.load(file)
rows = sorted(data['features'], key=lambda row: (row['date'], row['url']))
labels = data['labels']
active = [i for i, label in enumerate(labels) if label != 'neutral']
headlines = [row['headline'] for row in rows]
topics = [row['topics'] for row in rows]
votes = np.array([sum(row['recommendations']) for row in rows])
counts = np.array([row['count'] for row in rows])
Y = np.column_stack(([row['commentEmotion'] for row in rows], np.log1p(votes), np.log1p(counts)))
emotion = np.sqrt(np.array([row['headlineEmotion'] for row in rows]))
embeddings = np.array([row['vectors'] for row in rows])
similarities = embeddings @ embeddings.T
weeks = np.array([date.fromisoformat(row['date']).strftime('%G-W%V') for row in rows])
observed_weeks = np.unique(weeks)
periods = np.array_split(observed_weeks, min(5, len(observed_weeks)))
names = ('constant', 'topicTags', 'headlineEmotion', 'headlineWording', 'headlineEmbedding', 'combinedHeadline')


def fit_folds(folds):
    predictions = {name: np.full_like(Y, np.nan) for name in names}
    native_baseline = np.full((len(rows), 2), np.nan)
    diagnostics = []
    for train, test in folds:
        duplicate = similarities[np.ix_(train, test)].max(axis=1) >= .74
        train = train[~duplicate]
        if len(train) < 15:
            raise RuntimeError(f'Only {len(train)} rows available in the training fold')
        tags = MultiLabelBinarizer().fit([topics[i] for i in train])
        # Unseen topic values have zero features in the held-out fold.
        known = set(tags.classes_)
        tags_vectors = normalize(tags.transform([[tag for tag in row if tag in known] for row in topics])) if known else np.zeros((len(rows), 1))
        lexicon = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)
        lexicon.fit([headlines[i] for i in train])
        words = lexicon.transform(headlines)
        shifted = normalize(emotion - emotion[train].mean(axis=0))
        matrix = {
            'topicTags': tags_vectors @ tags_vectors.T,
            'headlineEmotion': shifted @ shifted.T,
            'headlineWording': (words @ words.T).toarray(),
            'headlineEmbedding': similarities,
        }
        matrix['combinedHeadline'] = np.mean([matrix[k] for k in ('headlineEmotion', 'headlineWording', 'headlineEmbedding')], axis=0)
        average = Y[train].mean(axis=0)
        predictions['constant'][test] = average
        native_baseline[test] = [np.median(votes[train]), np.median(counts[train])]
        for name, kernel in matrix.items():
            weights = np.linalg.solve(kernel[np.ix_(train, train)] + np.eye(len(train)), Y[train] - average)
            predictions[name][test] = average + kernel[np.ix_(test, train)] @ weights
            predictions[name][test, :len(labels)] = np.clip(predictions[name][test, :len(labels)], 0, 1)
        diagnostics.append({'train': len(train), 'test': len(test), 'nearDuplicateTrainingRowsRemoved': int(sum(duplicate)),
                            'weeks': sorted(set(weeks[test]))})
    return predictions, native_baseline, diagnostics


def groups(periods, chronological=False):
    for period in periods:
        test = np.flatnonzero(np.isin(weeks, period))
        train = np.flatnonzero(weeks < period[0]) if chronological else np.flatnonzero(~np.isin(weeks, period))
        yield train, test


def rho(x, y):
    if len(x) < 3 or np.ptp(x) == 0 or np.ptp(y) == 0:
        return None
    return float(spearmanr(x, y).statistic)


def metrics(predictions, baseline, indexes):
    results = {}
    for name, values in predictions.items():
        pred = values[indexes]
        actual = Y[indexes]
        err = np.abs(pred - actual)
        raw = baseline[indexes] if name == 'constant' else np.maximum(np.expm1(pred[:, -2:]), 0)
        top3 = np.argsort(pred[:, active], axis=1)[:, -3:]
        true3 = np.argsort(actual[:, active], axis=1)[:, -3:]
        results[name] = {
            'emotionMAE': float(err[:, active].mean()),
            'neutralMAE': float(err[:, labels.index('neutral')].mean()),
            'emotionRMSE': float(np.sqrt(np.square(err[:, active]).mean())),
            'emotionTop3Overlap': float(np.mean([len(set(a) & set(b)) / 3 for a, b in zip(top3, true3)])),
            'recommendationsMAE': float(np.abs(raw[:, 0] - votes[indexes]).mean()),
            'recommendationsLogMAE': float(err[:, -2].mean()),
            'recommendationsSpearman': rho(pred[:, -2], actual[:, -2]),
            'threadCountMAE': float(np.abs(raw[:, 1] - counts[indexes]).mean()),
            'threadCountLogMAE': float(err[:, -1].mean()),
            'threadCountSpearman': rho(pred[:, -1], actual[:, -1]),
        }
    return results


predictions, baseline, folds = fit_folds(groups(periods))
future_predictions, future_baseline, future_folds = fit_folds(groups([periods[-1]], chronological=True))
all_indexes = np.arange(len(rows))
latest = np.flatnonzero(np.isin(weeks, periods[-1]))
busy = np.flatnonzero(counts >= 200)
per_label = {name: {label: {'mae': float(np.abs(predictions[name][:, i] - Y[:, i]).mean()),
                           'spearman': rho(predictions[name][:, i], Y[:, i]), 'meanTarget': float(Y[:, i].mean())}
                    for i, label in enumerate(labels)} for name in names}
report = {
    'collectedAt': data['collectedAt'], 'sample': len(rows), 'topComments': 5 * len(rows),
    'dateRange': [rows[0]['date'], rows[-1]['date']], 'articlesWithTopicTags': sum(bool(tags) for tags in topics),
    'highEngagementArticles': len(busy), 'threadCountRange': [int(np.min(counts)), int(np.max(counts))],
    'topFiveRecommendationsRange': [int(np.min(votes)), int(np.max(votes))],
    'models': {'emotion': data['emotionId'], 'embedding': data['embeddingId']},
    'validation': {'folds': folds, 'chronologicalHoldout': future_folds, 'nearDuplicateCosine': .74},
    'fullSample': metrics(predictions, baseline, all_indexes),
    'highEngagementSubset': metrics(predictions, baseline, busy) if len(busy) else {},
    'latestWeeksHoldout': metrics(future_predictions, future_baseline, latest),
    'perEmotion': per_label,
    'articlePredictions': [{
        'url': row['url'], 'date': row['date'], 'actualTopFiveRecommendations': int(votes[i]),
        'actualThreadComments': int(counts[i]), 'predictedTopFiveRecommendations': round(float(max(np.expm1(predictions['combinedHeadline'][i, -2]), 0))),
        'predictedThreadComments': round(float(max(np.expm1(predictions['combinedHeadline'][i, -1]), 0))),
        'predictedEmotion': dict(zip(labels, predictions['combinedHeadline'][i, :len(labels)].tolist())),
        'actualEmotion': dict(zip(labels, row['commentEmotion'])),
    } for i, row in enumerate(rows)],
}
print('HEADLINE_RESPONSE_SUMMARY ' + json.dumps({key: value for key, value in report.items()
    if key not in {'perEmotion', 'articlePredictions'}}, allow_nan=False))
print('HEADLINE_RESPONSE_LABELS ' + json.dumps({name: per_label[name] for name in ('constant', 'headlineEmotion', 'combinedHeadline')}, allow_nan=False))
with open(target, 'w', encoding='utf8') as file:
    json.dump(report, file, indent=2, allow_nan=False)
