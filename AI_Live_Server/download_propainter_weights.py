import os
from pathlib import Path

import requests
from tqdm import tqdm


ROOT = Path(__file__).resolve().parent / "third_party" / "ProPainter"
WEIGHTS = ROOT / "weights"
BASE_URL = "https://github.com/sczhou/ProPainter/releases/download/v0.1.0"
FILES = [
    "raft-things.pth",
    "recurrent_flow_completion.pth",
    "ProPainter.pth",
]


def download(url: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 1024 * 1024:
        print(f"skip existing: {target}")
        return
    tmp = target.with_suffix(target.suffix + ".part")
    downloaded = tmp.stat().st_size if tmp.exists() else 0
    headers = {"Range": f"bytes={downloaded}-"} if downloaded > 0 else {}
    mode = "ab" if downloaded > 0 else "wb"
    with requests.get(url, stream=True, timeout=60, headers=headers) as response:
        if downloaded > 0 and response.status_code == 200:
            downloaded = 0
            mode = "wb"
        response.raise_for_status()
        content_length = int(response.headers.get("content-length") or 0)
        total = content_length + downloaded if downloaded > 0 else content_length
        with tmp.open(mode) as f, tqdm(total=total, initial=downloaded, unit="B", unit_scale=True, desc=target.name) as bar:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                f.write(chunk)
                bar.update(len(chunk))
    tmp.replace(target)
    print(f"saved: {target}")


def main():
    os.environ.setdefault("NO_PROXY", "*")
    os.environ.setdefault("no_proxy", "*")
    for filename in FILES:
        download(f"{BASE_URL}/{filename}", WEIGHTS / filename)


if __name__ == "__main__":
    main()
