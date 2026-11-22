"""Collect full Guardian article bodies and public recommendation rankings."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from itertools import islice, zip_longest
import json
import re
import sys
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
import requests


SITE = "https://www.theguardian.com"
DISCUSSION = "https://discussion.theguardian.com/discussion-api/discussion/"
SECTIONS = ("politics", "uk-news", "business", "society", "environment", "commentisfree")
MIN_COMMENTS = 200
ARTICLE = re.compile(r"^/(?:" + "|".join(SECTIONS) + r")/\d{4}/[a-z]{3}/\d{2}/[^/]+$")
SHORT_ID = re.compile(r"(?:/|\\/)p(?:/|\\/)([a-z0-9]{4,10})(?=[\"'\s/?<&])")


def fetch(url, **kwargs):
    response = requests.get(url, timeout=(6, 14), **kwargs)
    response.raise_for_status()
    return response


def section_links(section):
    urls = set()
    for page in range(1, 5):
        try:
            response = fetch(f"{SITE}/{section}/all", params={"page": page})
        except requests.RequestException:
            continue
        soup = BeautifulSoup(response.text, "html.parser")
        for anchor in soup.select("a[href]"):
            parts = urlsplit(urljoin(SITE, anchor["href"]))
            if parts.netloc == "www.theguardian.com" and ARTICLE.fullmatch(parts.path):
                url = SITE + parts.path
                if url not in urls:
                    urls.add(url)
                    yield url


def discussion_candidates(soup, source):
    fields = []
    for tag in soup.select('link[rel="shortlink"], meta[name="shortlink"], meta[property="og:shorturl"]'):
        fields.append(tag.get("href") or tag.get("content") or "")
    fields.extend(re.findall(r'"(?:shortUrl|shortURL|discussionId|discussionKey)"\s*:\s*"([^\"]+)"', source))
    return list(dict.fromkeys(SHORT_ID.findall(" ".join([*fields, source]) + " ")))


def article_body(soup):
    body = soup.select_one('[data-gu-name="body"], [data-testid="article-body"], .article-body-commercial-selector')
    if body is None:
        return []
    return [text for p in body.select("p, h2, h3, li")
            if not p.select_one("p, h2, h3, li")
            and not p.find_parent(["aside", "figure", "nav"])
            and (text := p.get_text(" ", strip=True))]


def recommended(short_id, expected_path):
    url = DISCUSSION + "p/" + short_id
    params = {"api-key": "discussion-rendering", "orderBy": "mostRecommended", "pageSize": 20,
              "displayThreaded": "false", "page": 1}
    response = fetch(url, params=params).json()
    discussion = response.get("discussion", {})
    canonical = discussion.get("webUrl") or discussion.get("url")
    if canonical and ARTICLE.fullmatch(urlsplit(canonical).path) and urlsplit(canonical).path != expected_path:
        return None
    count = discussion.get("commentCount", response.get("commentCount", 0))
    if not isinstance(count, int) or count < MIN_COMMENTS:
        return None
    comments = []
    for row in discussion.get("comments", []):
        votes = row.get("numRecommends", row.get("recommendationCount", row.get("recommends")))
        if not isinstance(votes, int) or row.get("status", "visible") in {"removed", "deleted"}:
            continue
        html = BeautifulSoup(row.get("body") or "", "html.parser")
        paragraphs = [block.get_text(" ", strip=True) for block in html.select("p")]
        body = "\n".join(paragraphs) if paragraphs else html.get_text(" ", strip=True)
        if body.strip():
            comments.append({"id": row["id"], "recommendations": votes, "body": body})
    if len(comments) < 5 or any(a["recommendations"] < b["recommendations"]
                                for a, b in zip(comments, comments[1:])):
        return None
    return count, comments[:5]


def collect(url):
    try:
        response = fetch(url)
        if not ARTICLE.fullmatch(urlsplit(response.url).path):
            return "redirect", None
        soup = BeautifulSoup(response.text, "html.parser")
        paragraphs = article_body(soup)
        headline = soup.select_one('meta[property="og:title"]')
        if sum(len(p.split()) for p in paragraphs) < 200 or headline is None:
            return "body", None
        ids = discussion_candidates(soup, response.text)
        for short_id in ids[:2]:
            try:
                result = recommended(short_id, urlsplit(response.url).path)
            except (requests.RequestException, ValueError):
                continue
            if result:
                count, comments = result
                return "selected", {"url": response.url, "headline": headline["content"],
                                    "paragraphs": paragraphs, "count": count, "comments": comments}
        return "no_eligible_discussion" if ids else "no_short_id", None
    except requests.RequestException:
        return "article_request", None


def main(output):
    articles = []
    outcomes = Counter()
    streams = [section_links(section) for section in SECTIONS]
    links = (url for group in zip_longest(*streams) for url in group if url)
    short_list = iter(dict.fromkeys(islice(links, 240)))
    seen = set()
    with ThreadPoolExecutor(max_workers=8) as pool:
        while len(articles) < 10 and (batch := list(islice(short_list, 16))):
            for status, item in pool.map(collect, batch):
                outcomes[status] += 1
                if item and item["url"] not in seen:
                    articles.append(item)
                    seen.add(item["url"])
                if len(articles) == 10:
                    break
    print("Collection outcomes:", dict(outcomes), flush=True)
    if len(articles) != 10:
        raise RuntimeError(f"Only {len(articles)} articles met the {MIN_COMMENTS}-comment threshold")
    print("Selected threads:", json.dumps([[a["url"], a["count"]] for a in articles]), flush=True)
    with open(output, "w", encoding="utf-8") as file:
        json.dump({"retrievedAt": datetime.now(timezone.utc).isoformat(), "articles": articles}, file)


if __name__ == "__main__":
    main(sys.argv[1])
