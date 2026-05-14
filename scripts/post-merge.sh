#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
uv sync --python "$(command -v python3.11 || command -v python3)" || true
