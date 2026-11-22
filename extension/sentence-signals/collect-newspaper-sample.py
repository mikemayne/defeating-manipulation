"""Collect non-sports newspaper articles to a scratch file for local scoring."""
import concurrent.futures
import itertools
import json
import re
import sys
from urllib.parse import urlsplit, urlunsplit
from xml.etree import ElementTree

import requests
import trafilatura
from bs4 import BeautifulSoup

GUARDIAN = "https://www.theguardian.com"
INDEPENDENT = "https://www.independent.co.uk"
EXPRESS = "https://www.express.co.uk"
MAIL = "https://www.dailymail.co.uk"
FEEDS = {
    "The Guardian": [f"{GUARDIAN}/{section}/rss" for section in
                     ("uk-news", "world", "politics", "business", "society", "environment", "technology")],
    "The Independent": [f"{INDEPENDENT}/{section}/rss" for section in
                        ("news/uk", "news/world", "news/business", "news", "voices")],
    "Daily Express": [f"{EXPRESS}/posts/rss/{section}" for section in ("news", "finance", "lifestyle")]
                      + [f"{EXPRESS}/rss/"],
    "Daily Mail": [f"{MAIL}/{section}/index.rss" for section in ("news", "money", "sciencetech", "health")]
                  + [f"{MAIL}/articles.rss"],
}
SPORT = re.compile(r"(?:^|[/,\s-])(?:sports?|football|soccer|cricket|rugby|tennis|golf|formula-1|f1|boxing|racing|nfl|nba|mlb|hockey|olympics|premier-league|champions-league|motorsport|basketball)(?:$|[/,\s-])", re.I)
NON_ARTICLE = re.compile(r"/(?:live|rss|video|videos|picture|gallery|podcasts?)(?:/|$)|/live(?:-|blog)", re.I)
HEADERS = {"User-Agent": "Newspaper sentence-pair research pilot (public article and RSS reader)"}


def fetch(url):
    response = requests.get(url, headers=HEADERS, timeout=(7, 14))
    response.raise_for_status()
    return response


def eligible(url):
    return not SPORT.search(urlsplit(url).path) and not NON_ARTICLE.search(urlsplit(url).path)


def clean_url(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def feed_links(feed):
    try:
        xml = ElementTree.fromstring(fetch(feed).content)
    except (requests.RequestException, ElementTree.ParseError):
        return []
    links = []
    for entry in xml.findall(".//item"):
        url = (entry.findtext("link") or "").strip()
        sections = " ".join(value.text or "" for value in entry.findall("category"))
        if url.startswith("https://") and eligible(url) and not SPORT.search(sections):
            links.append(clean_url(url))
    return links


def article(url):
    try:
        response = fetch(url)
        if not eligible(response.url):
            return None
        soup = BeautifulSoup(response.text, "html.parser")
        sections = [tag.get("content", "") for tag in soup.select('meta[property="article:section"], meta[name="article:section"], meta[name="section"], meta[property="article:tag"]')]
        if SPORT.search(" ".join(sections)):
            return None
        headline_tag = soup.select_one('meta[property="og:title"]')
        headline = (headline_tag.get("content", "") if headline_tag else "").strip()
        if not headline:
            return None
        canonical = soup.select_one('link[rel="canonical"]')
        final_url = clean_url(canonical.get("href") or response.url) if canonical else clean_url(response.url)
        if not eligible(final_url):
            return None
        body = trafilatura.extract(response.text, favor_precision=True, include_comments=False,
                                   include_tables=False, deduplicate=True)
        if not body or len(body.split()) < 175:
            return None
        paragraphs = [line.strip() for line in body.splitlines()
                      if len(line.split()) >= 6 and line.strip() != headline]
        if len(paragraphs) < 2:
            return None
        date = soup.select_one('meta[property="article:published_time"]')
        return {"url": final_url, "headline": headline, "paragraphs": paragraphs,
                "section": sections[0] if sections else None,
                "published": date.get("content") if date else None}
    except requests.RequestException:
        return None


def interleave(lists):
    return (value for group in itertools.zip_longest(*lists) for value in group if value)


def main(output):
    found = {name: [] for name in FEEDS}
    urls = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        candidates = {name: iter(dict.fromkeys(interleave(pool.map(feed_links, feeds))))
                      for name, feeds in FEEDS.items()}
        for target in (25, 40, 65, 110):
            for name, links in candidates.items():
                while len(found[name]) < target and sum(map(len, found.values())) < 100:
                    batch = list(itertools.islice(links, min(12, target - len(found[name]))))
                    if not batch:
                        break
                    for item in pool.map(article, batch):
                        if item and item["url"] not in urls:
                            if sum(map(len, found.values())) == 100:
                                break
                            urls.add(item["url"])
                            found[name].append({**item, "publisher": name})
        rows = list(interleave(found.values()))
    if len(rows) != 100:
        counts = {name: len(items) for name, items in found.items()}
        raise RuntimeError(f"Expected 100 accessible articles, got {len(rows)}: {counts}")
    with open(output, "w", encoding="utf-8") as file:
        json.dump(rows, file)
    print("Retrieved articles by publisher:", {name: len(items) for name, items in found.items()})


if __name__ == "__main__":
    main(sys.argv[1])
