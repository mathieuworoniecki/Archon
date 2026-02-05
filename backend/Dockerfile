FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for:
# - Tesseract OCR (text extraction from images)
# - FFmpeg (video keyframe extraction)
# - Archive tools (7z, unzip, unrar for automatic extraction)
# - PDF tools (poppler for PDF rendering)
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
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download SpaCy French model for NER
RUN python -m spacy download fr_core_news_sm || echo "SpaCy model download failed, will retry at runtime"

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
