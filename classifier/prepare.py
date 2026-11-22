"""Fetch pinned public encoder files and bundle an offline browser runtime."""
import argparse
import shutil
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
CANDIDATES = {
    "MiniLM-L3": ("sentence-transformers/paraphrase-MiniLM-L3-v2",
                 "4ca70771034acceecb2e72475f72050fcdde4ddc"),
    "MiniLM-L6": ("sentence-transformers/all-MiniLM-L6-v2",
                 "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"),
}
PACKAGES = {"@huggingface/transformers": "3.7.2", "onnxruntime-web": "1.22.0"}
DEEP_ENCODER = ("sentence-transformers/all-MiniLM-L12-v2",
                "a50ef00143b4d5391434df20ae11632588ac25be")

def download(url, target):
    if target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    urllib.request.urlretrieve(url, partial)
    partial.replace(target)

def prepare(with_l12=False):
    encoders = dict(CANDIDATES)
    if with_l12:
        encoders["MiniLM-L12"] = DEEP_ENCODER
    for name, (repo, revision) in encoders.items():
        target = ARTIFACTS / "encoders" / name
        revision_file = target / "revision.txt"
        if revision_file.exists() and revision_file.read_text(encoding="utf8") != revision:
            raise RuntimeError(f"Cached encoder revision differs from the pin: {target}")
        for file in ("config.json", "model.safetensors", "tokenizer.json",
                     "tokenizer_config.json", "vocab.txt", "special_tokens_map.json", "README.md"):
            download(f"https://huggingface.co/{repo}/resolve/{revision}/{file}", target / file)
        revision_file.write_text(revision, encoding="utf8")

    vendor = ARTIFACTS / "web" / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)
    for package, version in PACKAGES.items():
        basename = package.split("/")[-1]
        archive = ARTIFACTS / "downloads" / f"{basename}-{version}.tgz"
        download(f"https://registry.npmjs.org/{package}/-/{basename}-{version}.tgz", archive)
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                name = Path(member.name).name
                if not member.isfile():
                    continue
                if name.lower().startswith(("license", "notice")) and member.name.count("/") == 1:
                    (vendor / f"{basename}-{name}").write_bytes(tar.extractfile(member).read())
                if not member.name.startswith("package/dist/"):
                    continue
                if name in {"transformers.min.js", "ort.wasm.min.mjs",
                            "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"}:
                    (vendor / name).write_bytes(tar.extractfile(member).read())
    # The same-version Python wheel ships the project notices omitted by the npm tarball.
    import onnxruntime
    if onnxruntime.__version__ != PACKAGES["onnxruntime-web"]:
        raise RuntimeError("Install the matching Python and browser runtimes from requirements.txt.")
    for name in ("LICENSE", "ThirdPartyNotices.txt"):
        shutil.copyfile(Path(onnxruntime.__file__).parent / name, vendor / f"onnxruntime-{name}")
    download("https://www.apache.org/licenses/LICENSE-2.0.txt", vendor / "apache-2.0.txt")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-l12", action="store_true")
    prepare(parser.parse_args().with_l12)
