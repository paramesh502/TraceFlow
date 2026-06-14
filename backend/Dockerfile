# TraceFlow backend image: JDK (for the tracer) + Python (FastAPI).
# Build context is the backend/ directory.
# Portable: listens on $PORT if set (Render/Cloud Run), else 7860 (HF Spaces).
FROM eclipse-temurin:21-jdk

# Python runtime for FastAPI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user (Hugging Face Spaces convention; uid 1000).
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
WORKDIR /home/user/app

# Isolated Python env (avoids PEP 668 "externally managed" errors).
RUN python3 -m venv /home/user/venv
ENV PATH=/home/user/venv/bin:$PATH

# Install Python deps first for better layer caching.
COPY --chown=user:user requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source.
COPY --chown=user:user . ./

# Pre-compile the JDI tracer so the first request isn't slow and no write to the
# image is needed at runtime.
RUN mkdir -p tracer/build \
    && javac --add-modules jdk.jdi -d tracer/build tracer/src/com/traceflow/*.java

EXPOSE 7860
# Shell form so ${PORT} expands at runtime.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
