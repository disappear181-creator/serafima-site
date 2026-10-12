#!/usr/bin/env python3
"""Prepare an owned public GitVerse repository using one Actions secret."""

from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


API_BASE = "https://api.gitverse.ru"
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")
PROJECT = "serafima-site"


class BootstrapError(Exception):
    """Safe error text, without API response bodies or credentials."""


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise BootstrapError("The GitVerse API redirected the request; credentials were not forwarded.")


def identifier(value: object) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value) or value in {".", ".."}:
        raise BootstrapError("GitVerse returned an invalid account login.")
    return value


def request_api(method: str, path: str, token: str, body: dict | None = None):
    # The API base cannot be overridden by environment or command-line options.
    if not path.startswith("/") or ".." in path.split("/"):
        raise BootstrapError("Invalid GitVerse API path.")
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(
        API_BASE + path, data=payload, method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.gitverse.object+json;version=1",
            "Content-Type": "application/json",
            "User-Agent": "serafima-site-bootstrap",
        },
    )
    try:
        with build_opener(NoRedirects()).open(request, timeout=25) as response:
            data = response.read(2_000_001)
            if len(data) > 2_000_000:
                raise BootstrapError("The GitVerse API response was unexpectedly large.")
            try:
                return response.status, json.loads(data)
            except (ValueError, UnicodeError) as error:
                raise BootstrapError("GitVerse returned an invalid JSON response.") from error
    except HTTPError as error:
        if error.code == 404:
            return 404, None
        if error.code == 401:
            raise BootstrapError("GitVerse rejected authentication (401). Replace GITVERSE_TOKEN.") from None
        if error.code == 403:
            raise BootstrapError(
                "GitVerse denied access (403). The token needs User Read and Repo Write permissions."
            ) from None
        raise BootstrapError(f"GitVerse API request failed (HTTP {error.code}); retry the workflow.") from None
    except (URLError, TimeoutError, OSError):
        raise BootstrapError("GitVerse API is unavailable. Check connectivity and retry the workflow.") from None


def verify_repository(repository: object, login: str) -> None:
    if not isinstance(repository, dict):
        raise BootstrapError("GitVerse did not return repository details.")
    owner = repository.get("owner")
    if not isinstance(owner, dict) or owner.get("login") != login or repository.get("name") != login:
        raise BootstrapError("The target repository is not owned by the authenticated account. Nothing was changed.")
    if repository.get("private") is not False:
        raise BootstrapError("The existing repository is private. Visibility was not changed.")


def verify_destination(login: str, token: str) -> None:
    prefix = f"/repos/{login}/{login}"
    status, contents = request_api("GET", prefix + "/contents/", token)
    if status == 404 or contents == []:
        return
    if not isinstance(contents, list):
        raise BootstrapError("GitVerse returned unexpected root contents; nothing was overwritten.")
    status, marker = request_api("GET", prefix + "/contents/serafima-deploy.json", token)
    try:
        if status == 404 or not isinstance(marker, dict) or marker.get("encoding") != "base64":
            raise ValueError("missing marker")
        encoded = marker.get("content")
        if not isinstance(encoded, str) or len(encoded) > 8192:
            raise ValueError("invalid marker")
        document = json.loads(base64.b64decode("".join(encoded.split()), validate=True))
        if not isinstance(document, dict) or document.get("project") != PROJECT:
            raise ValueError("wrong project")
    except (ValueError, TypeError, binascii.Error, UnicodeError):
        raise BootstrapError(
            "The account-name repository contains another project without the serafima-site marker. "
            "Nothing was overwritten. Use a separate GitVerse account for this site."
        ) from None


def bootstrap(token: str, github_environment: Path) -> str:
    if not token or any(character in token for character in "\r\n\x00"):
        raise BootstrapError("Set the GITVERSE_TOKEN Actions secret first.")
    status, user = request_api("GET", "/user", token)
    if status == 404 or not isinstance(user, dict):
        raise BootstrapError("GitVerse did not return the authenticated account.")
    login = identifier(user.get("login"))
    prefix = f"/repos/{login}/{login}"
    status, repository = request_api("GET", prefix, token)
    if status == 404:
        status, repository = request_api(
            "POST", "/user/repos", token,
            {"name": login, "private": False, "auto_init": False},
        )
        if status not in {200, 201}:
            raise BootstrapError("GitVerse did not confirm repository creation.")
    verify_repository(repository, login)
    verify_destination(login, token)
    # Validated identifiers cannot inject extra lines into the Actions env file.
    with github_environment.open("a", encoding="utf-8") as output:
        for name in ("GITVERSE_OWNER", "GITVERSE_REPOSITORY", "GITVERSE_LOGIN"):
            output.write(f"{name}={login}\n")
    return login


def main() -> int:
    token = os.getenv("GITVERSE_TOKEN", "")
    environment_file = os.getenv("GITHUB_ENV", "")
    try:
        if not environment_file:
            raise BootstrapError("GITHUB_ENV is missing. Run this script through GitHub Actions.")
        login = bootstrap(token, Path(environment_file))
        print(f"GitVerse repository ready: {login}/{login}")
        return 0
    except (BootstrapError, OSError) as error:
        message = str(error)
        if token:
            message = message.replace(token, "[REDACTED]")
        print(f"Bootstrap failed: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
