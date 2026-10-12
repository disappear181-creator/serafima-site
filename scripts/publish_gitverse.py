#!/usr/bin/env python3
"""Copy the static site to GitVerse main without deleting other repository files.

Production credentials are read only from environment variables. For offline
verification, use --test-mode --local-target /path/to/an/existing/git/repository.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site"
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")
STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".gif",
    ".webp", ".ico", ".avif", ".woff", ".woff2", ".ttf", ".otf",
    ".txt", ".json", ".xml", ".pdf", ".mp4", ".webm",
}
SECRET_NAMES = re.compile(
    r"(?:^|[._-])(?:secret|secrets|credential|credentials|token|tokens|"
    r"password|passwords|private|id_rsa|id_ed25519)(?:$|[._-])", re.I
)
SECRET_CONTENT = re.compile(
    rb"-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----|"
    rb"\bgh[pousr]_[A-Za-z0-9]{20,}\b|"
    rb"\bgithub_pat_[A-Za-z0-9_]{20,}\b|"
    rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b|"
    rb"\bAKIA[0-9A-Z]{16}\b"
)


class DeployError(Exception):
    """An actionable deployment error safe to display after redaction."""


def checked_identifier(name: str, value: str | None) -> str:
    if not value or not IDENTIFIER.fullmatch(value) or value in {".", ".."}:
        raise DeployError(
            f"Set {name} to a valid GitVerse identifier (letters, digits, _, -, .; "
            "1–100 characters)."
        )
    return value


def collect_site() -> list[Path]:
    if not SOURCE.is_dir() or SOURCE.is_symlink():
        raise DeployError("The site/ directory is missing or is a symbolic link.")
    source_root = SOURCE.resolve()
    files: list[Path] = []
    for directory, folders, filenames in os.walk(SOURCE, followlinks=False):
        for name in folders + filenames:
            path = Path(directory) / name
            relative = path.relative_to(SOURCE)
            if path.is_symlink():
                raise DeployError(f"Symbolic links are not deployed: {relative}")
            if relative != Path(".nojekyll") and any(part.startswith(".") for part in relative.parts):
                raise DeployError(f"Hidden files/directories are not deployed: {relative}")
            if any(ord(character) < 32 for character in str(relative)):
                raise DeployError("Site file names must not contain control characters.")
            if not path.resolve().is_relative_to(source_root):
                raise DeployError("A site path resolves outside site/.")
        for name in filenames:
            path = Path(directory) / name
            relative = path.relative_to(SOURCE)
            if not path.is_file():
                raise DeployError(f"Only regular files may be deployed: {relative}")
            if (relative != Path(".nojekyll") and path.suffix.lower() not in STATIC_EXTENSIONS) or SECRET_NAMES.search(name):
                raise DeployError(f"Unsupported or sensitive site file: {relative}")
            if SECRET_CONTENT.search(path.read_bytes()):
                raise DeployError(f"Possible credential/private key in site file: {relative}")
            files.append(relative)
    if Path("index.html") not in files:
        raise DeployError("site/index.html is required before publication.")
    return sorted(files)


def redact(value: str, token: str) -> str:
    if token:
        for variant in {token, quote(token, safe="")}:
            value = value.replace(variant, "[REDACTED]")
    return value


def git_environment(askpass: Path | None, template: Path, login: str, token: str) -> dict[str, str]:
    environment = os.environ.copy()
    for name in list(environment):
        if name.startswith("GIT_") or name in {"GITVERSE_TOKEN", "GITVERSE_LOGIN"}:
            environment.pop(name, None)
    environment.update({
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_TEMPLATE_DIR": str(template),
        "GIT_LFS_SKIP_SMUDGE": "1",
    })
    if askpass is not None:
        environment.update({
            "GIT_ASKPASS": str(askpass),
            "GITVERSE_LOGIN": login,
            "GITVERSE_TOKEN": token,
        })
    return environment


def run_git(
    arguments: list[str], environment: dict[str, str], token: str,
    cwd: Path | None = None, allowed: tuple[int, ...] = (0,),
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["git", "-c", "credential.helper=", "-c", f"core.hooksPath={os.devnull}",
             "--literal-pathspecs", *arguments],
            cwd=cwd, env=environment, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180,
        )
    except subprocess.TimeoutExpired as error:
        raise DeployError("Git timed out. Check GitVerse availability and retry the workflow.") from error
    except FileNotFoundError as error:
        raise DeployError("Git is not installed in this environment.") from error
    if result.returncode not in allowed:
        details = redact((result.stderr or result.stdout).strip(), token)
        raise DeployError(f"Git {arguments[0]} failed: {details[:2000]}")
    return result


def destination_for(repository: Path, relative: Path) -> Path:
    destination = repository / relative
    current = repository
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise DeployError(f"Target site path contains a symbolic link: {relative}")
    if not destination.resolve().is_relative_to(repository.resolve()):
        raise DeployError("A destination resolves outside the cloned repository.")
    if destination.exists() and not destination.is_file():
        raise DeployError(f"A directory occupies the target file path: {relative}")
    return destination


def deploy(local_target: Path | None = None) -> int:
    files = collect_site()
    token = ""
    login = ""
    if local_target is None:
        owner = checked_identifier("GITVERSE_OWNER", os.getenv("GITVERSE_OWNER"))
        repository_name = checked_identifier("GITVERSE_REPOSITORY", os.getenv("GITVERSE_REPOSITORY"))
        login = checked_identifier("GITVERSE_LOGIN", os.getenv("GITVERSE_LOGIN") or owner)
        token = os.getenv("GITVERSE_TOKEN", "")
        if not token or any(character in token for character in "\r\n\x00"):
            raise DeployError("Set the GITVERSE_TOKEN Actions secret to a valid GitVerse access token.")
        target = f"https://gitverse.ru/{owner}/{repository_name}.git"
    else:
        local_target = local_target.expanduser().resolve()
        if not local_target.is_dir():
            raise DeployError("The local test repository does not exist.")
        target = str(local_target)

    with tempfile.TemporaryDirectory(prefix="serafima-deploy-") as temporary:
        temporary_root = Path(temporary)
        repository = temporary_root / "repository"
        template = temporary_root / "empty-template"
        template.mkdir()
        askpass = None
        if local_target is None:
            askpass = temporary_root / "askpass.sh"
            askpass.write_text(
                '#!/bin/sh\n'
                'case "$1" in\n'
                '  *sername*) printf "%s\\n" "$GITVERSE_LOGIN" ;;\n'
                '  *assword*) printf "%s\\n" "$GITVERSE_TOKEN" ;;\n'
                '  *) exit 1 ;;\n'
                'esac\n', encoding="utf-8",
            )
            askpass.chmod(0o700)
        environment = git_environment(askpass, template, login, token)
        try:
            run_git(["clone", "--no-checkout", "--", target, str(repository)], environment, token)
        except DeployError as error:
            raise DeployError(
                f"{error}\nCreate the target GitVerse repository first, then check owner/repository "
                "variables and the token's write permission. This script never creates repositories."
            ) from error
        main = run_git(
            ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"],
            environment, token, repository, allowed=(0, 1),
        )
        if main.returncode == 0:
            run_git(["checkout", "-B", "main", "origin/main"], environment, token, repository)
        else:
            refs = run_git(["show-ref"], environment, token, repository, allowed=(0, 1))
            if refs.stdout.strip():
                raise DeployError(
                    "The target repository has commits but no main branch. Create/rename its "
                    "publication branch to main and retry. Existing branches were not changed."
                )
            run_git(["checkout", "--orphan", "main"], environment, token, repository)

        if local_target is None:
            tracked = run_git(["ls-files"], environment, token, repository).stdout.strip()
            if tracked:
                marker = repository / "serafima-deploy.json"
                try:
                    if marker.is_symlink() or json.loads(marker.read_text()).get("project") != "serafima-site":
                        raise ValueError("wrong marker")
                except (OSError, ValueError, AttributeError):
                    raise DeployError(
                        "The target main branch contains another project without the serafima-site marker. "
                        "Nothing was overwritten."
                    ) from None

        # Validate every target before writing any file. Unrelated files are preserved.
        destinations = [(relative, destination_for(repository, relative)) for relative in files]
        for relative, destination in destinations:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, destination)
        paths = [relative.as_posix() for relative in files]
        run_git(["add", "--", *paths], environment, token, repository)
        changes = run_git(
            ["diff", "--cached", "--quiet", "--", *paths],
            environment, token, repository, allowed=(0, 1),
        )
        if changes.returncode == 0:
            print("No site changes to publish.")
            return 0
        run_git(
            ["-c", "user.name=Serafima site deploy", "-c",
             "user.email=serafima-deploy@users.noreply.github.com", "commit", "-m",
             "Publish Serafima website", "--", *paths],
            environment, token, repository,
        )
        run_git(["push", "origin", "HEAD:refs/heads/main"], environment, token, repository)
        print(f"Published {len(files)} site files to main. Other repository files were preserved.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-mode", action="store_true", help="Enable offline local-repository tests.")
    parser.add_argument("--local-target", type=Path, help="Existing local Git repository; requires --test-mode.")
    arguments = parser.parse_args()
    if arguments.test_mode != (arguments.local_target is not None):
        parser.error("Use --test-mode and --local-target together for offline verification only.")
    try:
        return deploy(arguments.local_target)
    except DeployError as error:
        print(redact(f"Deployment failed: {error}", os.getenv("GITVERSE_TOKEN", "")), file=sys.stderr)
        return 1
    except OSError as error:
        print(redact(f"Deployment failed: {error}", os.getenv("GITVERSE_TOKEN", "")), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
