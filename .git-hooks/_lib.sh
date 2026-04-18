#!/bin/bash
# Shared helpers for git hooks.
#
# Keep this file minimal — only expose constants and pure filter functions
# that more than one hook needs. Per-hook logic stays in its own file.
#
# Constants
# ---------
# ALLOWED_PUBLIC_KEY  — the real public API key shipped in socket-lib
#                       test fixtures. Safe to appear in commits.
# FAKE_TOKEN_MARKER   — substring marker used in test fixtures
#                       (see test/unit/utils/fake-tokens.ts). Any line
#                       containing this string is treated as a test fixture
#                       by secret scanners.
# SOCKET_SECURITY_ENV — name of the env var used in shell examples; not
#                       a token value itself. Exempted from scanners.
#
# Functions
# ---------
# filter_allowed_sktsec  — reads stdin, strips known-allowed sktsec lines
#                          (lines containing ALLOWED_PUBLIC_KEY, the marker,
#                          or the env var name).
# Colors
# ------
# RED, GREEN, NC

# shellcheck disable=SC2034  # constants are sourced by other hooks
ALLOWED_PUBLIC_KEY="sktsec_t_--RAN5U4ivauy4w37-6aoKyYPDt5ZbaT5JBVMqiwKo_api"
FAKE_TOKEN_MARKER="socket-lib-test-fake-token"
SOCKET_SECURITY_ENV="SOCKET_SECURITY_API_KEY="

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Strips lines that legitimately contain sktsec_ but are not real secrets.
# Usage:   echo "$text" | filter_allowed_sktsec
#          grep ... | filter_allowed_sktsec
filter_allowed_sktsec() {
  grep -v "$ALLOWED_PUBLIC_KEY" \
    | grep -v "$FAKE_TOKEN_MARKER" \
    | grep -v "$SOCKET_SECURITY_ENV" \
    | grep -v '\.example'
}
