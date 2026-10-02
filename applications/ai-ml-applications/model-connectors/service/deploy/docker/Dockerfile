# syntax=docker/dockerfile:1.4
# Multi-stage optimized hermetic build for ModelBox Connectors Service
# Adheres to STD-BLD-001/002 with minimal image footprint and unprivileged security

# Stage 1: Hermetic Builder
FROM python:3.14-slim AS builder

WORKDIR /build

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build tools
RUN python -m pip install --upgrade pip build wheel setuptools

# Copy project specification and source code
COPY pyproject.toml /build/
COPY src/ /build/src/

# Install ONLY production dependencies into an isolated prefix (excluding pytest/test tools)
RUN pip install --prefix=/install . && \
    find /install -type d -name "__pycache__" -exec rm -rf {} + && \
    find /install -type f -name "*.pyc" -delete

# Stage 2: Minimal Distroless / Slim Production Runtime
FROM python:3.14-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

# Create unprivileged non-root service account
RUN groupadd -g 10001 appuser && \
    useradd -u 10001 -g appuser -s /sbin/nologin -M appuser

# Copy installed production libraries from builder
COPY --from=builder /install /usr/local

# Copy application source & config directly with non-root ownership (eliminates duplicate chown layer)
COPY --chown=10001:10001 src /app/src
COPY --chown=10001:10001 config /app/config
COPY --chown=10001:10001 pyproject.toml /app/pyproject.toml

USER 10001:10001

EXPOSE 8000

# Native Python healthcheck eliminating need for curl or external OS packages
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

ENTRYPOINT ["uvicorn", "model_connectors.presentation.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
