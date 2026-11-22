"""Collect ranked public comments and headlines for a held-out prediction pilot."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from itertools import islice
import json
from pathlib import Path
import runpy
import sys
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
import requests


shared = runpy.run_path(str(Path(__file__).with_name('collect-article-comments.py')))
fetch = shared['fetch']
section_links = shared['section_links']
discussion_candidates = shared['discussion_candidates']
recommended = shared['recommended']


def article_date(url):
    return datetime.strptime('/'.join(urlsplit(url).path.split('/')[2:5]), '%Y/%b/%d').date()


def collect(url):
    try:
        response = fetch(url)
        if urlsplit(url).path != urlsplit(response.url).path:
            return None
        soup = BeautifulSoup(response.text, 'html.parser')
        headline = soup.select_one('meta[property="og:title"]')
        if not headline or not headline.get('content', '').strip():
            return None
        tags = [tag['content'] for tag in soup.select('meta[property="article:tag"][content]')]
        for short_id in discussion_candidates(soup, response.text)[:2]:
            try:
                result = recommended(short_id, urlsplit(url).path, minimum_comments=5)
            except (requests.RequestException, ValueError):
                continue
            if result:
                count, comments = result
                return {'url': url, 'date': article_date(url).isoformat(), 'headline': headline['content'],
                        'topics': tags[:4], 'count': count, 'comments': comments}
    except requests.RequestException:
        return None
    return None


def main(output):
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=4)
    urls = dict.fromkeys(url for url in section_links('commentisfree', pages=24) if article_date(url) <= cutoff)
    weeks = Counter()
    sample = []
    pending = (url for url in urls if weeks[article_date(url).isocalendar()[:2]] < 14)
    with ThreadPoolExecutor(max_workers=12) as pool:
        while len(sample) < 125 and (batch := list(islice(pending, 30))):
            for row in pool.map(collect, batch):
                if row is None:
                    continue
                week = date.fromisoformat(row['date']).isocalendar()[:2]
                if weeks[week] >= 14:
                    continue
                weeks[week] += 1
                sample.append(row)
                if len(sample) == 125:
                    break
            if sample:
                print(f'Collected {len(sample)} threads from {len(weeks)} weeks so far', flush=True)
    if len(sample) < 60 or len(weeks) < 5:
        raise RuntimeError(f'Insufficient coverage: {len(sample)} eligible threads across {len(weeks)} weeks')
    with open(output, 'w', encoding='utf8') as file:
        json.dump({'collectedAt': datetime.now(timezone.utc).isoformat(), 'articles': sample}, file)


if __name__ == '__main__':
    main(sys.argv[1])
