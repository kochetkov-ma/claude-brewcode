#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2025-2026 Maksim Kochetkov
import fcntl
import os
import secrets
import shutil
import stat
import subprocess
import sys


def regular(directory, name):
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    except FileNotFoundError:
        return None
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
        os.close(fd)
        raise ValueError('unsafe history or ignore file')
    return fd


def replace(directory, name, data, mode):
    temporary = '.brewpage-' + secrets.token_hex(12)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=directory)
    try:
        with os.fdopen(fd, 'wb') as output:
            os.fchmod(output.fileno(), mode)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def read(directory, name):
    fd = regular(directory, name)
    if fd is None:
        return None
    with os.fdopen(fd, 'rb') as source:
        return source.read(8 * 1024 * 1024 + 1)


def main():
    mode, root, relative = sys.argv[1:]
    if mode not in ('init', 'append') or relative not in ('.claude/brewpage-history.md', 'brewpage-history.md'):
        raise ValueError('invalid history operation or destination')
    root = os.path.realpath(root)
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(directory)
        if info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise ValueError('workspace must be owned and not writable by others')
        fcntl.flock(directory, fcntl.LOCK_EX)
        parts = relative.split('/')
        parent = directory
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=parent)
            except FileExistsError:
                pass
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            info = os.fstat(next_fd)
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                os.close(next_fd)
                raise ValueError('history directory must be owned and not writable by others')
            if parent != directory:
                os.close(parent)
            parent = next_fd
        try:
            data = read(parent, parts[-1])
            if data is not None and len(data) > 8 * 1024 * 1024:
                raise ValueError('history exceeds local 8 MiB limit')
            git_repo = shutil.which('git') is not None and subprocess.run(['git', '-C', root, 'rev-parse', '--git-dir'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if git_repo:
                tracked = subprocess.run(['git', '-C', root, 'ls-files', '--error-unmatch', '--', relative], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if tracked.returncode == 0:
                    raise ValueError('history is tracked by git; remove it from the index before publishing')
            ignore = read(directory, '.gitignore')
            if ignore is not None and len(ignore) > 8 * 1024 * 1024:
                raise ValueError('ignore file exceeds local 8 MiB limit')
            if git_repo or ignore is not None:
                ignore = ignore or b''
                entry = relative.encode()
                if entry not in ignore.splitlines():
                    replace(directory, '.gitignore', ignore + (b'\n' if ignore and not ignore.endswith(b'\n') else b'') + entry + b'\n', 0o644)
            incoming = sys.stdin.buffer.read(1024 * 1024 + 1)
            if len(incoming) > 1024 * 1024:
                raise ValueError('history row exceeds local limit')
            replace(parent, parts[-1], (data or b'') + incoming if mode == 'append' else data if data is not None else incoming, 0o600)
        finally:
            if parent != directory:
                os.close(parent)
    finally:
        os.close(directory)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        print('FAILED: secure history write refused (' + str(error).split(':')[0] + ')', file=sys.stderr)
        sys.exit(1)
