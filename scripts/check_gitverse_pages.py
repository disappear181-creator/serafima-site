#!/usr/bin/env python3
"""Verify public Pages files against site/, without authentication credentials."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

from bootstrap_gitverse import connection_failure
from publish_gitverse import SOURCE, checked_identifier, collect_site, DeployError


class VerificationError(Exception):
    pass


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def check_files(base: str, files: list[Path]) -> list[str]:
    opener = build_opener(NoRedirects())
    verified = []
    for relative in files:
        expected = (SOURCE / relative).read_bytes()
        url = base + quote(relative.as_posix(), safe="/")
        request = Request(url, headers={
            "User-Agent": "serafima-pages-verification",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
        })
        try:
            with opener.open(request, timeout=15) as response:
                actual = response.read(len(expected) + 1)
                if response.status != 200:
                    raise VerificationError(f"{relative}: HTTP {response.status}.")
                if relative.suffix == ".html" and response.headers.get_content_type() != "text/html":
                    raise VerificationError(f"{relative}: expected an HTML response.")
        except HTTPError as error:
            raise VerificationError(f"{relative}: HTTP {error.code}.") from None
        except (URLError, TimeoutError, OSError) as error:
            raise VerificationError(f"{relative}: {connection_failure(error)}") from None
        if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
            raise VerificationError(f"{relative}: public content differs from the current site files.")
        verified.append(relative.as_posix())
    return verified


def summary(base: str, message: str) -> None:
    destination = os.getenv("GITHUB_STEP_SUMMARY")
    if destination:
        with open(destination, "a", encoding="utf-8") as output:
            output.write(f"### Public website verification\n\n{base}\n\n{message}\n")


def main() -> int:
    try:
        owner = checked_identifier("GITVERSE_OWNER", os.getenv("GITVERSE_OWNER"))
        repository = checked_identifier("GITVERSE_REPOSITORY", os.getenv("GITVERSE_REPOSITORY"))
        base = f"https://{owner}.gitverse.site/"
        if repository != owner:
            base += quote(repository, safe="") + "/"
        files = [path for path in collect_site() if path != Path(".nojekyll")]
    except DeployError as error:
        print(f"Pages verification could not start: {error}", file=sys.stderr)
        return 1

    # Pages builds are asynchronous. Bound retries; a failed check never reruns deployment.
    failure = ""
    for attempt in range(3):
        try:
            verified = check_files(base, files)
            message = f"Verified {len(verified)} public files: HTTP 200 and SHA-256 match."
            print(f"{base} {message}")
            print("Files: " + ", ".join(verified))
            summary(base, message)
            return 0
        except VerificationError as error:
            failure = str(error)
            print(f"Pages verification attempt {attempt + 1}/3: {failure}", file=sys.stderr)
            if attempt < 2:
                time.sleep(2)
    message = (
        f"Public website NOT verified. {failure} "
        "The file transfer may have succeeded separately. Check the GitVerse Pages build status "
        "and its branch/folder settings."
    )
    print(message, file=sys.stderr)
    summary(base, message)
    return 1


if __name__ == "__main__":
    sys.exit(main())
