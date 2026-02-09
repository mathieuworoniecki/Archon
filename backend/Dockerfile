FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies for:
# - Tesseract OCR (text extraction from images)
# - FFmpeg (video keyframe extraction)
# - Archive tools (7z, unzip, unrar for automatic extraction)
# - PDF tools (poppler for PDF rendering)
# - Email tools (pst-utils for PST/OST parsing)
# - Forensic tools (libewf for E01 image parsing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    libmagic1 \
    curl \
    p7zip-full \
    unzip \
    unrar-free \
    ffmpeg \
    poppler-utils \
    pst-utils \
    libewf-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------- Builder stage: install Python deps ----------
FROM base AS builder

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Download SpaCy French model into the same prefix
RUN pip install --no-cache-dir --prefix=/install spacy && \
    pip install --no-cache-dir --prefix=/install \
    https://github.com/explosion/spacy-models/releases/download/fr_core_news_sm-3.8.0/fr_core_news_sm-3.8.0-py3-none-any.whl || \
    echo "SpaCy model download failed, will retry at runtime"

# ---------- Runtime stage: lean final image ----------
FROM base AS runtime

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
