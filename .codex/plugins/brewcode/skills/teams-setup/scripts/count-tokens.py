#!/usr/bin/env python3
"""Count UTF-8 text with the pinned teams-setup tokenizer."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import os
import sys
import tempfile
from pathlib import Path


TIKTOKEN_VERSION = "0.13.0"
ENCODING_NAME = "o200k_base"
ENCODING_URL = (
    "https://openaipublic.blob.core.windows.net/encodings/"
    "o200k_base.tiktoken"
)
ENCODING_SHA256 = (
    "446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d"
)


def verified_cache_path() -> Path:
    cache_dir = os.environ.get(
        "TIKTOKEN_CACHE_DIR",
        os.environ.get(
            "DATA_GYM_CACHE_DIR",
            str(Path(tempfile.gettempdir()) / "data-gym-cache"),
        ),
    )
    if not cache_dir:
        raise RuntimeError("exact tokenizer cache is disabled")
    cache_key = hashlib.sha1(ENCODING_URL.encode()).hexdigest()
    cache_path = Path(cache_dir) / cache_key
    if not cache_path.is_file():
        raise RuntimeError(
            f"verified {ENCODING_NAME} cache is required; expected sha256={ENCODING_SHA256}"
        )
    observed = hashlib.sha256(cache_path.read_bytes()).hexdigest()
    if observed != ENCODING_SHA256:
        raise RuntimeError(
            f"{ENCODING_NAME} cache hash mismatch: expected {ENCODING_SHA256}, "
            f"found {observed}"
        )
    return cache_path


def encoding():
    try:
        installed = importlib.metadata.version("tiktoken")
    except importlib.metadata.PackageNotFoundError:
        raise RuntimeError(f"tiktoken=={TIKTOKEN_VERSION} is required; nothing was installed")
    if installed != TIKTOKEN_VERSION:
        raise RuntimeError(
            f"tiktoken=={TIKTOKEN_VERSION} is required, found {installed}; nothing was installed"
        )
    verified_cache_path()
    try:
        import tiktoken

        return tiktoken.get_encoding(ENCODING_NAME)
    except (ImportError, KeyError, ValueError) as error:
        raise RuntimeError(f"cannot load pinned encoding {ENCODING_NAME}: {error}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, help="UTF-8 file; stdin when omitted")
    parser.add_argument("--check", action="store_true", help="verify the pinned tokenizer only")
    args = parser.parse_args()
    try:
        tokenizer = encoding()
        if args.check:
            print(
                f"tiktoken={TIKTOKEN_VERSION} encoding={ENCODING_NAME} "
                f"bpe_sha256={ENCODING_SHA256} cache=verified-offline"
            )
            return 0
        text = args.path.read_text(encoding="utf-8") if args.path else sys.stdin.read()
        print(len(tokenizer.encode_ordinary(text)))
        return 0
    except (OSError, UnicodeError, RuntimeError) as error:
        print(f"ERROR: exact token count unavailable: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
