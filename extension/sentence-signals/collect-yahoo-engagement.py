"""Select ten eligible Yahoo News documents with both vote counts in the public release."""
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter

import ijson


def keys(row):
    return {re.sub(r"[^a-z0-9]", "", k.lower()): v for k, v in row.items()}


def pick(row, *names):
    return next((row[n] for n in names if n in row), None)


def blocks(value):
    if isinstance(value, dict):
        value = pick(keys(value), "text", "content", "body", "paragraphs", "sentences")
    if isinstance(value, list):
        return [piece for part in value for piece in blocks(part)]
    if isinstance(value, str):
        return [s.strip() for s in value.splitlines() if s.strip()]
    return []


def vote(value):
    if type(value) is int and value >= 0:
        return value
    if isinstance(value, str) and value.isdecimal():
        return int(value)
    return None


def parse(row, source_id, shapes):
    if not isinstance(row, dict):
        return None
    row = keys(row)
    shapes.update([",".join(sorted(row))])
    news = pick(row, "news", "article")
    fields = keys(news) | row if isinstance(news, dict) else row
    category = pick(fields, "category", "topic")
    if isinstance(category, str) and "sport" in category.lower():
        return None
    headline = pick(fields, "title", "headline", "newstitle")
    content = pick(fields, "paragraphs", "paras", "body", "articletext", "abstract", "content", "text", "newstext", "articlecontent", "newsbody")
    if content is None:
        content = news
    paragraphs = blocks(content)
    comments = pick(fields, "comments", "cmts", "commentlist", "replies")
    if isinstance(content, list) and content:
        unit = content[0]
        shapes.update(["paragraph:" + (",".join(sorted(keys(unit))) if isinstance(unit, dict) else type(unit).__name__)])
    if isinstance(comments, list) and comments:
        unit = comments[0]
        shapes.update(["comment structure:" + (",".join(sorted(keys(unit))) if isinstance(unit, dict) else type(unit).__name__)])
    if not isinstance(headline, str) or sum(len(p.split()) for p in paragraphs) < 150 or not isinstance(comments, list) or len(comments) < 20:
        return None
    out = []
    for i, raw in enumerate(comments):
        if not isinstance(raw, dict):
            continue
        raw = keys(raw)
        shapes.update(["comment:" + ",".join(sorted(raw))])
        vote_fields = pick(raw, "vote", "votes", "ratings")
        if isinstance(vote_fields, dict):
            shapes.update(["vote structure:" + ",".join(sorted(keys(vote_fields)))])
        counts = keys(vote_fields) | raw if isinstance(vote_fields, dict) else raw
        up = vote(pick(counts, "upvote", "upvotes", "positivevotes", "posvotes", "up", "likes", "thumbsup"))
        down = vote(pick(counts, "downvote", "downvotes", "negativevotes", "negvotes", "down", "dislikes", "thumbsdown"))
        body = "\n".join(blocks(pick(raw, "text", "content", "body", "comment", "commenttext", "cmt")))
        if up is None or down is None or not body:
            continue
        out.append(dict(id=i, upvotes=up, downvotes=down, recommendations=up + down, body=body))
    if len(out) != len(comments):
        return None
    out.sort(key=lambda r: (-r["recommendations"], r["id"]))
    url = pick(fields, "url", "link", "newsurl", "articleurl")
    return dict(url=url if isinstance(url, str) and url.startswith(("http://", "https://")) else "Yahoo release " + source_id,
                headline=headline, paragraphs=paragraphs, count=len(comments), comments=out[:5], sourceId=source_id)


def records(archive, member):
    with archive.open(member) as stream:
        first = stream.peek(64).lstrip()[:1]
        if first == b"[":
            yield from ijson.items(stream, "item")
        else:
            yield from ijson.items(stream, "", multiple_values=True)


archive_path, output_path = sys.argv[1:]
chosen = []
seen = set()
shapes = Counter()
with zipfile.ZipFile(archive_path) as archive:
    members = [n for n in archive.namelist() if not n.endswith("/") and not n.startswith("__MACOSX/")]
    print("Archive members:", [(n, archive.getinfo(n).file_size) for n in members][:30], flush=True)
    members.sort(key=lambda n: (not bool(re.search(r"test|dev|valid", n, re.I)), n))
    for member in members:
        try:
            for i, row in enumerate(records(archive, member)):
                article = parse(row, f"{member}:{i + 1}", shapes)
                if article is None:
                    continue
                digest = hashlib.sha256("\n".join(article["paragraphs"]).encode()).digest()
                if digest not in seen:
                    seen.add(digest)
                    chosen.append(article)
                if len(chosen) == 10:
                    break
        except (ijson.JSONError, UnicodeError) as error:
            print("Skipped non-JSON member:", member, type(error).__name__, flush=True)
        if len(chosen) == 10:
            break
print("Schema keys:", shapes.most_common(12), flush=True)
if len(chosen) != 10:
    raise SystemExit(f"Found {len(chosen)} articles with 20 or more comments and complete vote fields.")
with open(output_path, "w", encoding="utf-8") as output:
    json.dump({"retrievedAt": "Yahoo News research release snapshot", "articles": chosen}, output)
print("Selected ten Yahoo News articles with complete vote fields in the release.")
