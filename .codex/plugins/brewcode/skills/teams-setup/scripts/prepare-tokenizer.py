#!/usr/bin/env python3
"""Prepare and run the isolated, hash-pinned teams-setup tokenizer."""

from __future__ import annotations

import argparse
import base64
import contextlib
import csv
import errno
import hashlib
import io
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
import venv
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Optional

if os.name == "nt":
    import msvcrt
else:
    import fcntl


TIKTOKEN_VERSION = "0.13.0"
DECLARED_DEPENDENCIES = ("regex", "requests")
ENCODING_NAME = "o200k_base"
ENCODING_URL = (
    "https://openaipublic.blob.core.windows.net/encodings/"
    "o200k_base.tiktoken"
)
ENCODING_SHA256 = (
    "446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d"
)
ENCODING_CACHE_KEY = hashlib.sha1(ENCODING_URL.encode()).hexdigest()
PREPARE_LOCK_TIMEOUT_SECONDS = 120
PIP_ENV_ALLOWLIST = frozenset(
    {
        "COMSPEC",
        "LANG",
        "LC_ALL",
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "TMPDIR",
        "WINDIR",
    }
)
RUNTIME_ENV_ALLOWLIST = frozenset(
    {
        "COMSPEC",
        "LANG",
        "LC_ALL",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "TMPDIR",
        "WINDIR",
    }
)


@dataclass(frozen=True)
class Wheel:
    filename: str
    sha256: str
    url: str


WHEELS = {
    ("Darwin", "arm64", "cp39"): Wheel(
        "tiktoken-0.13.0-cp39-cp39-macosx_11_0_arm64.whl",
        "2a3b536c55802fe42f4b4644d2be4f04bf788506b48de0a0a658cb58f8bce232",
        "https://files.pythonhosted.org/packages/6b/7a/bf0829f99d87d25257165e2314d80df1f990568e659b0c72a95a1e8d226c/tiktoken-0.13.0-cp39-cp39-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp39"): Wheel(
        "tiktoken-0.13.0-cp39-cp39-manylinux_2_28_x86_64.whl",
        "477c9a38e20d0ed248090509acf1e839ad3967a4f00b4b0f958210049f656dee",
        "https://files.pythonhosted.org/packages/ac/7d/222a5729dce08bc575ebb5ab39a27b8df4abd59c962a1e9a1efd16420d70/tiktoken-0.13.0-cp39-cp39-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "arm64", "cp310"): Wheel(
        "tiktoken-0.13.0-cp310-cp310-macosx_11_0_arm64.whl",
        "7d40c6c5aab171dcd6eb8455bc567bde404bb9def60cdb8c1299cc782b242bb9",
        "https://files.pythonhosted.org/packages/5e/30/760463e5b2e8ad2bc229ae0a17ecb06727b6cbc094f08d8f65844315632e/tiktoken-0.13.0-cp310-cp310-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp310"): Wheel(
        "tiktoken-0.13.0-cp310-cp310-manylinux_2_28_x86_64.whl",
        "ed5a30027cb4d8c7ca8b273d4766f3db3cf58fad9e9f3b1a68a351ffb54873d5",
        "https://files.pythonhosted.org/packages/51/e0/92557768fb0801f0d9dd9243cb9b6d342900b05e4b1006d4771f49ce233e/tiktoken-0.13.0-cp310-cp310-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "arm64", "cp311"): Wheel(
        "tiktoken-0.13.0-cp311-cp311-macosx_11_0_arm64.whl",
        "91c180fe255bd5a86d8316210d2833a1d4d33d026cd86a67812f4773743c8d26",
        "https://files.pythonhosted.org/packages/75/91/10b9c7076bc02c246c853201fdbbe300a4b8c5ed7b84c25f7403f4e32655/tiktoken-0.13.0-cp311-cp311-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp311"): Wheel(
        "tiktoken-0.13.0-cp311-cp311-manylinux_2_28_x86_64.whl",
        "36217497eaffc158607a3b26f065300db2aefd43b115263f3b9688ce38146173",
        "https://files.pythonhosted.org/packages/f9/39/fe42ad00de01a8c4a49ad8649a2c8a316835a9cad5961b11d21eac0020a5/tiktoken-0.13.0-cp311-cp311-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "arm64", "cp312"): Wheel(
        "tiktoken-0.13.0-cp312-cp312-macosx_11_0_arm64.whl",
        "4d9980f11429ed2d737c463bb1fb78cf330caa026adf002f714aced7849a687b",
        "https://files.pythonhosted.org/packages/36/18/d4ac9d20956cdebca04841316660ed584c2fecdc2b81722a28bc7ad3b1e4/tiktoken-0.13.0-cp312-cp312-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp312"): Wheel(
        "tiktoken-0.13.0-cp312-cp312-manylinux_2_28_x86_64.whl",
        "a116178fa7e1b4065bff05214360373a65cac22f965be7b3f73d00a0dbfe7649",
        "https://files.pythonhosted.org/packages/34/de/2ca96b07a82d972b74fe4b46de055b79c904e45c7eab699354a0bfa697dc/tiktoken-0.13.0-cp312-cp312-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "arm64", "cp313"): Wheel(
        "tiktoken-0.13.0-cp313-cp313-macosx_11_0_arm64.whl",
        "8fe806a50664e83a6ffd56cbd1e4f5dcc6cd32a3e7538f70dc38b1a271384545",
        "https://files.pythonhosted.org/packages/53/61/c68e123b6d753e3fc2751e9b18e732c9d8bf1e1926762e736eee935d931c/tiktoken-0.13.0-cp313-cp313-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp313"): Wheel(
        "tiktoken-0.13.0-cp313-cp313-manylinux_2_28_x86_64.whl",
        "5e6358911cab4adee6712da27d65573496a4f68cf8a2b5fca6a4ad10fc5748cf",
        "https://files.pythonhosted.org/packages/86/f5/bab735d2c72ea55404b295d02d092644eb5f7cc6205e34d35eb9abfb9ab2/tiktoken-0.13.0-cp313-cp313-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "arm64", "cp314"): Wheel(
        "tiktoken-0.13.0-cp314-cp314-macosx_11_0_arm64.whl",
        "ca8b310bd93b3772cb1b7922d915446864860f562bdfe4825c63a0aed3fb28cd",
        "https://files.pythonhosted.org/packages/d9/77/5ec6e6bc5b30bed6d93f7f2162d8f6b32437b3ba27cb527cfe004f6109c9/tiktoken-0.13.0-cp314-cp314-macosx_11_0_arm64.whl",
    ),
    ("Linux", "x86_64", "cp314"): Wheel(
        "tiktoken-0.13.0-cp314-cp314-manylinux_2_28_x86_64.whl",
        "5ba5fd62507a932d1241346179e3b39bc7bf7408f03c272652d93b3bedf5db24",
        "https://files.pythonhosted.org/packages/1b/ac/6a5dddd1d0a6018ecb389bd0353e6b4a515eb4d2286611bd0ace1937b9e1/tiktoken-0.13.0-cp314-cp314-manylinux_2_28_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp39"): Wheel(
        "tiktoken-0.13.0-cp39-cp39-macosx_10_12_x86_64.whl",
        "35e1ea1e0631c04f551297284a1ab7e1f65a3c55a9a48728d5e0f66b4527c04a",
        "https://files.pythonhosted.org/packages/51/da/1c97d0a8f1e9732eb1303d15df57d1a3d8dd40b3e53466db7e8a1228142d/tiktoken-0.13.0-cp39-cp39-macosx_10_12_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp310"): Wheel(
        "tiktoken-0.13.0-cp310-cp310-macosx_10_12_x86_64.whl",
        "47b1df8d73390a24f94980c75158cdd5c56d256f16d55f30cb49c230caba9ba4",
        "https://files.pythonhosted.org/packages/38/e3/03c90dadcf5b3f82b83cee9adee60ef666b329c654f58c066af44eae0287/tiktoken-0.13.0-cp310-cp310-macosx_10_12_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp311"): Wheel(
        "tiktoken-0.13.0-cp311-cp311-macosx_10_12_x86_64.whl",
        "7bfe1849caa65d1e1d9871817170ec497bbb7984e182012e1bdce72f66608cdb",
        "https://files.pythonhosted.org/packages/1a/4c/1bc81f4cd53e827c4ee67ca951b5935724716049452d8dfa09b8b82372bb/tiktoken-0.13.0-cp311-cp311-macosx_10_12_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp312"): Wheel(
        "tiktoken-0.13.0-cp312-cp312-macosx_10_13_x86_64.whl",
        "32ac870a806cfb260a02d0cb70426aef02e038297f8ad50df5040bb5af360791",
        "https://files.pythonhosted.org/packages/85/8e/144bde4e01df66b34bb865557c7cd754ed08b036217ebd79c9db5e9048a9/tiktoken-0.13.0-cp312-cp312-macosx_10_13_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp313"): Wheel(
        "tiktoken-0.13.0-cp313-cp313-macosx_10_13_x86_64.whl",
        "5df5d1507bd245f1ccad4a074698240021239e455eb0bb4ced4e3d7181872154",
        "https://files.pythonhosted.org/packages/9c/83/b096c859c2a47c11731bf2f5885f4028b809dfe2396582883eed9cae372f/tiktoken-0.13.0-cp313-cp313-macosx_10_13_x86_64.whl",
    ),
    ("Darwin", "x86_64", "cp314"): Wheel(
        "tiktoken-0.13.0-cp314-cp314-macosx_10_13_x86_64.whl",
        "eaaaef47c2406277181d2086484c317bf7fc433e2d5d03ff94f56b0dcec87471",
        "https://files.pythonhosted.org/packages/8c/93/0dd6adca026a616c3a92974566b43381eea4b475ce1f36c062b8271a9ac5/tiktoken-0.13.0-cp314-cp314-macosx_10_13_x86_64.whl",
    ),
    ("Linux", "aarch64", "cp39"): Wheel(
        "tiktoken-0.13.0-cp39-cp39-manylinux_2_28_aarch64.whl",
        "b8ac2d6420ff05841a89ba5205c6d45f56c4f6843454f3c884b7eb1a2a8dddb2",
        "https://files.pythonhosted.org/packages/c2/0a/675f2351e187086515efdd6d6adf62e3582cafcd7e1935b0efd9529e5529/tiktoken-0.13.0-cp39-cp39-manylinux_2_28_aarch64.whl",
    ),
    ("Linux", "aarch64", "cp310"): Wheel(
        "tiktoken-0.13.0-cp310-cp310-manylinux_2_28_aarch64.whl",
        "9b842981fa91accdffd48ff6408a977b7a91c3fbda55d353c3c68114d5c9d69e",
        "https://files.pythonhosted.org/packages/de/8a/8895f342a6b6aabd1a358e672f6f077b3ae51d0c63ca605d142db3bcd8ab/tiktoken-0.13.0-cp310-cp310-manylinux_2_28_aarch64.whl",
    ),
    ("Linux", "aarch64", "cp311"): Wheel(
        "tiktoken-0.13.0-cp311-cp311-manylinux_2_28_aarch64.whl",
        "059c8ecf554eb5b41e6e054ba467b871b03277d267dee7244380aca4359747d4",
        "https://files.pythonhosted.org/packages/4e/e4/fceae98015fab47fcd49b8bd7f46145bcd187a47e0add1e5378ed67ef980/tiktoken-0.13.0-cp311-cp311-manylinux_2_28_aarch64.whl",
    ),
    ("Linux", "aarch64", "cp312"): Wheel(
        "tiktoken-0.13.0-cp312-cp312-manylinux_2_28_aarch64.whl",
        "3f277ebea5edd7b8bf03c6f9431e1d67d517530115572b2dc1d465326e8f88c7",
        "https://files.pythonhosted.org/packages/74/ed/6bb8d05b9f731f749fee5c6f5ca63e981143c826a5985877330507bd13b7/tiktoken-0.13.0-cp312-cp312-manylinux_2_28_aarch64.whl",
    ),
    ("Linux", "aarch64", "cp313"): Wheel(
        "tiktoken-0.13.0-cp313-cp313-manylinux_2_28_aarch64.whl",
        "125bc05005e747f993a83dc67934249932d6e4209854452cd4c0b1d53fba3ba2",
        "https://files.pythonhosted.org/packages/ef/8b/96cc178cc584e65d363134500f297790b06cd48cdeb1e8fcf7bbe60f4715/tiktoken-0.13.0-cp313-cp313-manylinux_2_28_aarch64.whl",
    ),
    ("Linux", "aarch64", "cp314"): Wheel(
        "tiktoken-0.13.0-cp314-cp314-manylinux_2_28_aarch64.whl",
        "32e0c12305105002c047b3bb1070b0dd9a73b0cb3b2856a8972b810e7a4f5881",
        "https://files.pythonhosted.org/packages/94/b0/c8ae9aff00d625c50659b4513e707a0462c4bf5d4d6cc1b802103225c02e/tiktoken-0.13.0-cp314-cp314-manylinux_2_28_aarch64.whl",
    ),
    ("Windows", "x86_64", "cp39"): Wheel(
        "tiktoken-0.13.0-cp39-cp39-win_amd64.whl",
        "b967dfb9d0adf9a631953b1b40717684f04478270fc51bbccdd2f838d67a2f00",
        "https://files.pythonhosted.org/packages/ff/69/e75a479e1f8b761dfe9f03c4a0ea2adfa87f6da9a66272974672c59db3e7/tiktoken-0.13.0-cp39-cp39-win_amd64.whl",
    ),
    ("Windows", "x86_64", "cp310"): Wheel(
        "tiktoken-0.13.0-cp310-cp310-win_amd64.whl",
        "44733b99bfd72b590cd0936b1c01b3b4dd73122db2d544bc1ceeb18a7678c910",
        "https://files.pythonhosted.org/packages/c3/16/27e9f7e0ed76e501cfefc9fb2112df4c7bf70ca96945b15ecb7615aac860/tiktoken-0.13.0-cp310-cp310-win_amd64.whl",
    ),
    ("Windows", "x86_64", "cp311"): Wheel(
        "tiktoken-0.13.0-cp311-cp311-win_amd64.whl",
        "fc1c44cd37b43fc46bae593129164f4f281e82ea116b57a85aa81bda57eafc94",
        "https://files.pythonhosted.org/packages/7e/25/a10efd564402d82c2ff50d12057353ace447aa8007deceaa48641f63d35c/tiktoken-0.13.0-cp311-cp311-win_amd64.whl",
    ),
    ("Windows", "x86_64", "cp312"): Wheel(
        "tiktoken-0.13.0-cp312-cp312-win_amd64.whl",
        "8f2d16e7a7c783ad81f36e457d046d1f1c8af70b22aec8a13238efe531977c41",
        "https://files.pythonhosted.org/packages/aa/90/28d7f154888610aa9237e541986beb62b479df29d193a5a0617dbb1514d0/tiktoken-0.13.0-cp312-cp312-win_amd64.whl",
    ),
    ("Windows", "x86_64", "cp313"): Wheel(
        "tiktoken-0.13.0-cp313-cp313-win_amd64.whl",
        "6b1615f0ff71953d19729ceb18865429c185b0a23c5353f1bbca34a394bf60f7",
        "https://files.pythonhosted.org/packages/42/a6/c1936d16055436cb32e6c6128d68629622e00f4768562f55653752d34768/tiktoken-0.13.0-cp313-cp313-win_amd64.whl",
    ),
    ("Windows", "x86_64", "cp314"): Wheel(
        "tiktoken-0.13.0-cp314-cp314-win_amd64.whl",
        "115c4f26ffa11caac8b54eea35c2ad38c612c20a48d35dd15d70a02ac6f51f58",
        "https://files.pythonhosted.org/packages/dd/3d/fef7e06e3b33e7538db0ced734cf9fe23b6832d2ac4990c119c377aec55e/tiktoken-0.13.0-cp314-cp314-win_amd64.whl",
    ),
}


def fail(message: str) -> None:
    raise RuntimeError(message)


def normalized_platform() -> tuple[str, str, str]:
    system = platform.system()
    machine = platform.machine().lower()
    if machine == "aarch64" and system == "Darwin":
        machine = "arm64"
    if machine in ("amd64", "x64"):
        machine = "x86_64"
    if platform.python_implementation() != "CPython":
        fail("teams-setup tokenizer requires CPython")
    abi = f"cp{sys.version_info.major}{sys.version_info.minor}"
    key = (system, machine, abi)
    if key not in WHEELS:
        supported = (
            "macOS arm64/x86_64, Linux x86_64/aarch64, or Windows x86_64 "
            "with CPython 3.9..3.14"
        )
        fail(f"unsupported tokenizer runtime {system}/{machine}/{abi}; require {supported}")
    return key


def cache_root() -> Path:
    configured = os.environ.get("BREWCODE_TOKENIZER_ROOT")
    if configured:
        root = Path(configured).expanduser()
    elif platform.system() == "Darwin":
        root = Path.home() / "Library/Caches/claude-brewcode/teams-setup/tokenizer"
    elif platform.system() == "Windows":
        base = Path(
            os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")
        )
        root = base / "claude-brewcode/teams-setup/tokenizer"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        root = base / "claude-brewcode/teams-setup/tokenizer"
    if ".." in root.parts:
        fail(f"refusing parent traversal in tokenizer cache root: {root}")
    root = Path(os.path.abspath(root))
    if root == Path(root.anchor) or len(root.parts) < 3:
        fail(f"refusing broad tokenizer cache root: {root}")
    return root


@dataclass(frozen=True)
class Runtime:
    root: Path
    wheel: Wheel
    wheel_path: Path
    venv_path: Path
    python: Path
    bpe_cache_dir: Path
    bpe_path: Path


def runtime() -> Runtime:
    system, machine, abi = normalized_platform()
    wheel = WHEELS[(system, machine, abi)]
    root = cache_root()
    runtime_id = f"{system.lower()}-{machine}-{abi}-py{platform.python_version()}"
    runtime_root = root / runtime_id
    venv_path = runtime_root / "venv"
    python = python_in_venv(venv_path, system)
    bpe_cache_dir = runtime_root / "data-gym-cache"
    return Runtime(
        root=root,
        wheel=wheel,
        wheel_path=root / "artifacts" / wheel.filename,
        venv_path=venv_path,
        python=python,
        bpe_cache_dir=bpe_cache_dir,
        bpe_path=bpe_cache_dir / ENCODING_CACHE_KEY,
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def python_in_venv(venv_path: Path, system: Optional[str] = None) -> Path:
    current_system = system or platform.system()
    if current_system == "Windows":
        return venv_path / "Scripts/python.exe"
    return venv_path / "bin/python"


def site_packages_in_venv(venv_path: Path, system: Optional[str] = None) -> Path:
    current_system = system or platform.system()
    if current_system == "Windows":
        return venv_path / "Lib/site-packages"
    return (
        venv_path
        / f"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"
    )


def wheel_install_manifest(item: Runtime) -> dict[str, tuple[str, int]]:
    require_hash(item.wheel_path, item.wheel.sha256, "tiktoken wheel")
    with zipfile.ZipFile(item.wheel_path) as archive:
        archive_files = [info.filename for info in archive.infolist() if not info.is_dir()]
        if len(archive_files) != len(set(archive_files)):
            fail("authenticated tiktoken wheel contains duplicate file names")
        records = [
            name for name in archive.namelist() if name.endswith(".dist-info/RECORD")
        ]
        if len(records) != 1:
            fail("authenticated tiktoken wheel must contain exactly one RECORD")
        record_name = records[0]
        try:
            rows = csv.reader(io.StringIO(archive.read(record_name).decode("utf-8")))
        except (KeyError, UnicodeError, zipfile.BadZipFile) as error:
            fail(f"cannot read authenticated tiktoken wheel RECORD: {error}")
        manifest: dict[str, tuple[str, int]] = {}
        for row in rows:
            if len(row) != 3:
                fail("authenticated tiktoken wheel RECORD has a malformed row")
            relative_text, digest_spec, size_text = row
            relative = PurePosixPath(relative_text)
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or "\\" in relative_text
                or not relative.parts
            ):
                fail(f"authenticated tiktoken wheel RECORD has unsafe path: {relative_text}")
            if relative_text == record_name:
                if digest_spec or size_text:
                    fail("authenticated tiktoken wheel RECORD self-row must be unhashed")
                payload = archive.read(record_name)
                manifest[relative.as_posix()] = (
                    hashlib.sha256(payload).hexdigest(),
                    len(payload),
                )
                continue
            if not digest_spec.startswith("sha256=") or not size_text.isdigit():
                fail(f"authenticated tiktoken wheel RECORD lacks sha256/size: {relative_text}")
            encoded = digest_spec.removeprefix("sha256=")
            try:
                digest = base64.urlsafe_b64decode(
                    encoded + "=" * (-len(encoded) % 4)
                ).hex()
            except (ValueError, TypeError) as error:
                fail(f"authenticated tiktoken wheel RECORD hash is invalid: {error}")
            manifest[relative.as_posix()] = (digest, int(size_text))
        if not manifest:
            fail("authenticated tiktoken wheel RECORD is empty")
        if set(manifest) != set(archive_files):
            fail("authenticated tiktoken wheel RECORD does not match its file inventory")
        return manifest


def installed_tree_entries(root: Path) -> list[tuple[Path, os.stat_result]]:
    entries: list[tuple[Path, os.stat_result]] = []
    pending = [root]
    while pending:
        directory = pending.pop()
        require_directory(directory, "installed tokenizer tree")
        with os.scandir(directory) as stream:
            for entry in stream:
                path = Path(entry.path)
                observed = path.lstat()
                if stat.S_ISLNK(observed.st_mode) or windows_reparse_point(
                    path, observed
                ):
                    fail(f"installed tokenizer tree contains redirected entry: {path}")
                entries.append((path, observed))
                if stat.S_ISDIR(observed.st_mode):
                    pending.append(path)
    return entries


def attest_installed_distribution(item: Runtime, venv_path: Path) -> None:
    manifest = wheel_install_manifest(item)
    site_packages = site_packages_in_venv(venv_path)
    require_directory_chain(site_packages, "isolated tokenizer site-packages")
    expected_files = set(manifest)
    expected_directories: set[str] = set()
    for relative_text in expected_files:
        parent = PurePosixPath(relative_text).parent
        while parent != PurePosixPath("."):
            expected_directories.add(parent.as_posix())
            parent = parent.parent

    for installed, observed in installed_tree_entries(site_packages):
        relative = installed.relative_to(site_packages)
        relative_text = relative.as_posix()
        if "__pycache__" in relative.parts or installed.suffix.lower() in (".pyc", ".pyo"):
            fail(f"installed tokenizer bytecode cache is forbidden: {relative_text}")
        if stat.S_ISDIR(observed.st_mode):
            if relative_text not in expected_directories:
                fail(f"installed tokenizer tree has unexpected directory: {relative_text}")
            continue
        if not stat.S_ISREG(observed.st_mode):
            fail(f"installed tokenizer tree has non-regular entry: {relative_text}")
        if relative_text not in expected_files:
            if len(relative.parts) == 1:
                fail(
                    "installed tokenizer site-packages has unexpected top-level entry: "
                    f"{relative_text}"
                )
            fail(f"installed tokenizer tree has unexpected file: {relative_text}")

    for relative_text, (expected_hash, expected_size) in manifest.items():
        relative = PurePosixPath(relative_text)
        installed = site_packages.joinpath(*relative.parts)
        require_directory_chain(installed.parent, "installed tokenizer file parent")
        try:
            observed = installed.lstat()
        except FileNotFoundError:
            fail(f"installed tokenizer file missing: {relative_text}")
        if (
            stat.S_ISLNK(observed.st_mode)
            or windows_reparse_point(installed, observed)
            or not stat.S_ISREG(observed.st_mode)
        ):
            fail(f"installed tokenizer file is unsafe: {relative_text}")
        if observed.st_size != expected_size or sha256(installed) != expected_hash:
            fail(f"installed tokenizer file hash mismatch: {relative_text}")


def require_hash(path: Path, expected: str, label: str) -> None:
    try:
        observed = path.lstat()
    except FileNotFoundError:
        fail(f"missing {label}: {path}")
    if (
        stat.S_ISLNK(observed.st_mode)
        or windows_reparse_point(path, observed)
        or not stat.S_ISREG(observed.st_mode)
    ):
        fail(f"refusing non-regular or symlinked {label}: {path}")
    observed = sha256(path)
    if observed != expected:
        fail(f"{label} hash mismatch: expected {expected}, found {observed}")


def windows_reparse_point(path: Path, metadata: os.stat_result) -> bool:
    if os.name != "nt":
        return False
    junction_probe = getattr(path, "is_junction", None)
    if callable(junction_probe) and junction_probe():
        return True
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", None)
    file_attributes = getattr(metadata, "st_file_attributes", None)
    if reparse_flag is None or file_attributes is None:
        fail(f"cannot validate Windows reparse safety: {path}")
    return bool(file_attributes & reparse_flag)


def require_directory(path: Path, label: str) -> None:
    try:
        observed = path.lstat()
    except FileNotFoundError:
        fail(f"missing or unsafe {label}: {path}")
    if (
        stat.S_ISLNK(observed.st_mode)
        or windows_reparse_point(path, observed)
        or not stat.S_ISDIR(observed.st_mode)
    ):
        fail(f"missing or unsafe {label}: {path}")


def path_components(path: Path) -> list[Path]:
    if not path.is_absolute() or not path.anchor:
        fail(f"tokenizer path must be absolute: {path}")
    current = Path(path.anchor)
    components = [current]
    for segment in path.relative_to(current).parts:
        current /= segment
        components.append(current)
    return components


def require_directory_chain(path: Path, label: str) -> None:
    for component in path_components(path):
        require_directory(component, label)


def ensure_directory_chain(path: Path, label: str) -> None:
    components = path_components(path)
    require_directory(components[0], label)
    for component in components[1:]:
        try:
            component.mkdir(mode=0o700)
        except FileExistsError:
            pass
        require_directory(component, label)


def ensure_directory(root: Path, path: Path, label: str) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError:
        fail(f"{label} escapes tokenizer root: {path}")
    ensure_directory_chain(root, "tokenizer root")
    ensure_directory_chain(root.joinpath(*relative.parts), label)


def remove_managed_tree(root: Path, path: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError:
        fail(f"refusing cleanup outside tokenizer runtime: {path}")
    if not relative.parts or path == root:
        fail(f"refusing broad tokenizer cleanup: {path}")
    require_directory_chain(root, "tokenizer runtime directory")
    try:
        observed = path.lstat()
    except FileNotFoundError:
        return
    if windows_reparse_point(path, observed):
        fail(f"refusing Windows reparse cleanup target: {path}")
    if stat.S_ISLNK(observed.st_mode):
        path.unlink()
    elif stat.S_ISDIR(observed.st_mode):
        shutil.rmtree(path)
    else:
        fail(f"refusing non-directory tokenizer cleanup target: {path}")


def remove_managed_entry(root: Path, path: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError:
        fail(f"refusing cleanup outside tokenizer install tree: {path}")
    if not relative.parts or path == root:
        fail(f"refusing broad tokenizer install cleanup: {path}")
    require_directory_chain(root, "tokenizer install root")
    try:
        observed = path.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISLNK(observed.st_mode) or windows_reparse_point(path, observed):
        fail(f"refusing redirected tokenizer install cleanup target: {path}")
    if stat.S_ISDIR(observed.st_mode):
        with os.scandir(path) as stream:
            children = [Path(entry.path) for entry in stream]
        for child in children:
            remove_managed_entry(root, child)
        path.rmdir()
    elif stat.S_ISREG(observed.st_mode):
        path.unlink()
    else:
        fail(f"refusing non-regular tokenizer install cleanup target: {path}")


def materialize_authenticated_wheel(item: Runtime, venv_path: Path) -> None:
    manifest = wheel_install_manifest(item)
    site_packages = site_packages_in_venv(venv_path)
    require_directory_chain(site_packages, "isolated tokenizer site-packages")
    with os.scandir(site_packages) as stream:
        existing = [Path(entry.path) for entry in stream]
    for entry in existing:
        remove_managed_entry(site_packages, entry)

    with zipfile.ZipFile(item.wheel_path) as archive:
        for relative_text, (expected_hash, expected_size) in sorted(manifest.items()):
            relative = PurePosixPath(relative_text)
            payload = archive.read(relative_text)
            if len(payload) != expected_size or hashlib.sha256(payload).hexdigest() != expected_hash:
                fail(f"authenticated wheel payload differs from RECORD: {relative_text}")
            installed = site_packages.joinpath(*relative.parts)
            ensure_directory(site_packages, installed.parent, "tokenizer install directory")
            info = archive.getinfo(relative_text)
            archived_mode = (info.external_attr >> 16) & 0o777
            installed_mode = 0o755 if archived_mode & 0o111 else 0o644
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(installed, flags, 0o600)
            try:
                offset = 0
                while offset < len(payload):
                    written = os.write(descriptor, payload[offset:])
                    if written <= 0:
                        fail(f"short authenticated wheel write: {relative_text}")
                    offset += written
            finally:
                os.close(descriptor)
            installed.chmod(installed_mode)


def download(
    root: Path, url: str, destination: Path, expected: str, label: str
) -> None:
    ensure_directory(root, destination.parent, f"{label} directory")
    if os.path.lexists(destination):
        observed = destination.lstat()
        if (
            stat.S_ISLNK(observed.st_mode)
            or windows_reparse_point(destination, observed)
            or not stat.S_ISREG(observed.st_mode)
        ):
            fail(f"refusing non-regular or redirected {label}: {destination}")
        if sha256(destination) == expected:
            return
    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent, prefix=f".{destination.name}.part-"
    )
    temporary = Path(temporary_name)
    digest = hashlib.sha256()
    try:
        with (
            os.fdopen(descriptor, "wb") as output,
            urllib.request.urlopen(url, timeout=30) as response,
        ):
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                digest.update(chunk)
        observed = digest.hexdigest()
        if observed != expected:
            fail(f"downloaded {label} hash mismatch: expected {expected}, found {observed}")
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


@contextlib.contextmanager
def preparation_lock(item: Runtime, *, create: bool):
    if create:
        ensure_directory(item.root, item.root, "tokenizer root")
    else:
        require_directory_chain(item.root, "tokenizer root")
    lock_path = item.root / ".prepare.lock"
    flags = os.O_RDWR | (os.O_CREAT if create else 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if lock_path.is_symlink():
        fail(f"refusing symlinked tokenizer preparation lock: {lock_path}")
    descriptor = os.open(lock_path, flags, 0o600)
    acquired = False
    try:
        opened = os.fstat(descriptor)
        linked = os.stat(lock_path, follow_symlinks=False)
        if (
            not stat.S_ISREG(opened.st_mode)
            or stat.S_ISLNK(linked.st_mode)
            or windows_reparse_point(lock_path, linked)
            or (opened.st_dev, opened.st_ino) != (linked.st_dev, linked.st_ino)
        ):
            fail(f"tokenizer preparation lock is not a regular file: {lock_path}")
        if os.name == "nt" and create and opened.st_size == 0:
            os.write(descriptor, b"\0")
        deadline = time.monotonic() + PREPARE_LOCK_TIMEOUT_SECONDS
        while True:
            try:
                if os.name == "nt":
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                if time.monotonic() >= deadline:
                    fail(
                        "timed out waiting for another tokenizer preparation "
                        f"after {PREPARE_LOCK_TIMEOUT_SECONDS}s"
                    )
                time.sleep(0.1)
        yield
    finally:
        if acquired:
            if os.name == "nt":
                os.lseek(descriptor, 0, os.SEEK_SET)
                msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def runtime_env(item: Runtime) -> dict[str, str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in RUNTIME_ENV_ALLOWLIST
    }
    environment["TIKTOKEN_CACHE_DIR"] = str(item.bpe_cache_dir)
    return environment


def pip_install_env() -> dict[str, str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in PIP_ENV_ALLOWLIST
    }
    environment.update(
        {
            "PIP_CONFIG_FILE": os.devnull,
            "PIP_DISABLE_PIP_VERSION_CHECK": "1",
            "PIP_NO_INDEX": "1",
            "PIP_NO_INPUT": "1",
        }
    )
    return environment


@contextlib.contextmanager
def sanitized_venv_creation_environment():
    original = dict(os.environ)
    safe = {
        key: value
        for key, value in original.items()
        if key.upper() in PIP_ENV_ALLOWLIST
    }
    os.environ.clear()
    os.environ.update(safe)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(original)


def probe_python(item: Runtime, venv_path: Path) -> None:
    site_packages = site_packages_in_venv(venv_path)
    probe = subprocess.run(
        [
            sys.executable,
            "-I",
            "-S",
            "-B",
            "-c",
            (
                "import sys; "
                "sys.dont_write_bytecode = True; "
                "sys.pycache_prefix = sys.argv[1]; "
                "sys.path.insert(0, sys.argv[2]); "
                "from importlib.metadata import PackageNotFoundError, version; "
                f"assert version('tiktoken') == '{TIKTOKEN_VERSION}'; "
                "import tiktoken; "
                f"assert tiktoken.get_encoding('{ENCODING_NAME}').name == '{ENCODING_NAME}'; "
                "import sys; "
                "assert 'regex' not in sys.modules and 'requests' not in sys.modules; "
                "exec(\"for name in ('regex', 'requests'):\\n"
                " try:\\n  version(name)\\n"
                " except PackageNotFoundError:\\n  continue\\n"
                " raise AssertionError(f'{name} must not be installed')\")"
            ),
            str(venv_path.parent / ".attested-pycache-disabled"),
            str(site_packages),
        ],
        env=runtime_env(item),
        capture_output=True,
        text=True,
        timeout=20,
    )
    if probe.returncode != 0:
        detail = (probe.stderr or probe.stdout).strip()
        fail(f"isolated tokenizer probe failed: {detail or 'unknown error'}")


def check_unlocked(item: Runtime) -> str:
    require_directory_chain(item.root, "tokenizer root")
    require_directory_chain(
        item.wheel_path.parent, "tokenizer artifact directory"
    )
    require_directory_chain(item.venv_path.parent, "tokenizer runtime directory")
    require_directory_chain(item.bpe_cache_dir, "tokenizer cache directory")
    require_hash(item.wheel_path, item.wheel.sha256, "tiktoken wheel")
    require_hash(item.bpe_path, ENCODING_SHA256, "o200k_base cache")
    attest_installed_distribution(item, item.venv_path)
    probe_python(item, item.venv_path)
    return (
        f"tiktoken={TIKTOKEN_VERSION} encoding={ENCODING_NAME} "
        f"wheel_sha256={item.wheel.sha256} bpe_sha256={ENCODING_SHA256} "
        f"cache=verified-durable"
    )


def check(item: Runtime) -> str:
    with preparation_lock(item, create=False):
        return check_unlocked(item)


def prepare(item: Runtime) -> str:
    with preparation_lock(item, create=True):
        try:
            return check_unlocked(item)
        except (OSError, RuntimeError, subprocess.SubprocessError):
            pass
        download(
            item.root,
            item.wheel.url,
            item.wheel_path,
            item.wheel.sha256,
            "tiktoken wheel",
        )
        download(
            item.root,
            ENCODING_URL,
            item.bpe_path,
            ENCODING_SHA256,
            "o200k_base cache",
        )
        ensure_directory(item.root, item.venv_path.parent, "tokenizer runtime directory")
        if os.path.lexists(item.venv_path):
            require_directory(item.venv_path, "tokenizer venv")
        build_path: Optional[Path] = Path(
            tempfile.mkdtemp(prefix=".venv-build-", dir=item.venv_path.parent)
        )
        backup_path: Optional[Path] = None
        try:
            with sanitized_venv_creation_environment():
                venv.EnvBuilder(with_pip=True).create(build_path)
            build_python = python_in_venv(build_path)
            install = subprocess.run(
                [
                    str(build_python),
                    "-I",
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    "--no-deps",
                    "--no-index",
                    "--no-compile",
                    str(item.wheel_path),
                ],
                env=pip_install_env(),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if install.returncode != 0:
                detail = (install.stderr or install.stdout).strip()
                fail(f"isolated tokenizer install failed: {detail or 'unknown error'}")
            materialize_authenticated_wheel(item, build_path)
            attest_installed_distribution(item, build_path)
            probe_python(item, build_path)
            if item.venv_path.exists():
                backup_path = item.venv_path.with_name(
                    f".venv-old-{uuid.uuid4().hex}"
                )
                os.replace(item.venv_path, backup_path)
            try:
                os.replace(build_path, item.venv_path)
                build_path = None
            except OSError:
                if backup_path is not None and not item.venv_path.exists():
                    os.replace(backup_path, item.venv_path)
                    backup_path = None
                raise
        finally:
            if build_path is not None and build_path.exists():
                remove_managed_tree(item.venv_path.parent, build_path)
            if backup_path is not None and backup_path.exists():
                remove_managed_tree(item.venv_path.parent, backup_path)
        return check_unlocked(item)


def run(item: Runtime, command: list[str]) -> int:
    if not command:
        fail("run requires a command")
    if command[0].startswith("-") and command[0] not in ("-", "-c"):
        fail(
            f"run rejects interpreter option {command[0]}; "
            "use run <script>, run -, or run -c <code>"
        )
    if command[0] == "-c" and len(command) < 2:
        fail("run -c requires code")
    with preparation_lock(item, create=False):
        check_unlocked(item)
        site_packages = site_packages_in_venv(item.venv_path)
        runner = """import runpy, sys
sys.dont_write_bytecode = True
sys.pycache_prefix = sys.argv[1]
sys.path.insert(0, sys.argv[2])
mode = sys.argv[3]
if mode == '-':
    sys.argv = ['-', *sys.argv[4:]]
    exec(compile(sys.stdin.read(), '<stdin>', 'exec'), {'__name__': '__main__'})
elif mode == '-c':
    code = sys.argv[4]
    sys.argv = ['-c', *sys.argv[5:]]
    exec(compile(code, '<string>', 'exec'), {'__name__': '__main__'})
else:
    sys.argv = sys.argv[3:]
    runpy.run_path(mode, run_name='__main__')
"""
        completed = subprocess.run(
            [
                sys.executable,
                "-I",
                "-S",
                "-B",
                "-c",
                runner,
                str(item.venv_path.parent / ".attested-pycache-disabled"),
                str(site_packages),
                *command,
            ],
            env=runtime_env(item),
            stdin=sys.stdin,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        return completed.returncode


def manifest() -> str:
    records = [
        {"system": key[0], "machine": key[1], "abi": key[2], **asdict(wheel)}
        for key, wheel in sorted(WHEELS.items())
    ]
    return json.dumps(
        {
            "schema_version": 1,
            "tiktoken_version": TIKTOKEN_VERSION,
            "encoding": ENCODING_NAME,
            "encoding_url": ENCODING_URL,
            "encoding_sha256": ENCODING_SHA256,
            "declared_dependencies": list(DECLARED_DEPENDENCIES),
            "isolated_installed_dependencies": [],
            "isolated_loaded_dependencies": [],
            "wheels": records,
        },
        sort_keys=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "mode", choices=("prepare", "check", "run", "manifest")
    )
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.mode == "manifest":
            print(manifest())
            return 0
        item = runtime()
        if args.mode == "prepare":
            print(prepare(item))
            return 0
        if args.mode == "check":
            print(check(item))
            return 0
        return run(item, args.command)
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        if args.mode != "prepare":
            print(
                f"REPAIR: {sys.executable} -I -S {Path(__file__).resolve()} prepare",
                file=sys.stderr,
            )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
