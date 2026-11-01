#!/usr/bin/env python3
"""Publish only verified site/ files from the owner's public GitHub repository.

Install outside public_html. Run with Python 3 from SpaceWeb Cron; no credentials.
Downloads are staged and checked before publication. index.html is replaced last.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import urllib.parse
import urllib.request

REPO = 'disappear181-creator/serafima-site'
API = 'https://api.github.com/repos/' + REPO + '/git/trees/main?recursive=1'


def fetch(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent': 'Serafima-site-publisher'})
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError('Unexpected response: ' + str(response.status))
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError('Download exceeds size limit')
    return data


def publish(home):
    home = Path(home).resolve()
    target = home / 'public_html'
    target.mkdir(parents=True, exist_ok=True)
    cache = home / '.serafima-publisher'
    cache.mkdir(mode=0o700, exist_ok=True)
    with (cache / 'lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another publication is running', flush=True)
            return
        tree = json.loads(fetch(API, 2_000_000))
        commit = tree.get('sha', '')
        if tree.get('truncated') or len(commit) != 40:
            raise RuntimeError('Incomplete source tree')
        entries = []
        for entry in tree['tree']:
            if entry['type'] != 'blob' or not entry['path'].startswith('site/'):
                continue
            name = PurePosixPath(entry['path'][5:])
            if name.is_absolute() or '..' in name.parts or not name.parts or entry['mode'] != '100644':
                raise RuntimeError('Unsafe source path')
            destination = target / str(name)
            if destination.is_symlink() or target not in destination.resolve().parents:
                raise RuntimeError('Unsafe destination path')
            entries.append((str(name), entry['sha'], entry.get('size', 0)))
        if not entries or len(entries) > 500 or sum(e[2] for e in entries) > 60_000_000 or not any(e[0] == 'index.html' for e in entries):
            raise RuntimeError('Unexpected site manifest')
        state_path = cache / 'state.json'
        previous = json.loads(state_path.read_text()) if state_path.exists() else {}
        if previous.get('commit') == commit and previous.get('sha256') and all(
            (target / name).is_file() and not (target / name).is_symlink()
            and hashlib.sha256((target / name).read_bytes()).hexdigest() == digest
            for name, digest in previous['sha256'].items()
        ):
            print('Current ' + commit, flush=True)
            return
        digests = {}
        with tempfile.TemporaryDirectory(prefix='stage-', dir=str(cache)) as staging:
            stage = Path(staging)
            def download(entry):
                name, expected, size = entry
                url = 'https://raw.githubusercontent.com/' + REPO + '/' + commit + '/site/' + urllib.parse.quote(name)
                data = fetch(url, 15_000_000)
                blob = b'blob ' + str(len(data)).encode() + b'\0' + data
                if hashlib.sha1(blob).hexdigest() != expected:
                    raise RuntimeError('Source verification failed: ' + name)
                path = stage / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                return name, hashlib.sha256(data).hexdigest()
            with ThreadPoolExecutor(max_workers=4) as pool:
                digests.update(pool.map(download, entries))
            for name in sorted(digests, key=lambda name: name == 'index.html'):
                destination = target / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.chmod(str(stage / name), 0o644)
                os.replace(str(stage / name), str(destination))
        state_tmp = cache / 'state.tmp'
        state_tmp.write_text(json.dumps({'commit': commit, 'sha256': digests}, sort_keys=True))
        os.chmod(str(state_tmp), 0o600)
        os.replace(str(state_tmp), str(state_path))
        print('Published ' + commit + ': ' + str(len(digests)) + ' verified files', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--home', required=True)
    publish(parser.parse_args().home)
