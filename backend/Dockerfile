# Use Python 3.11 slim as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for FFmpeg, librosa, and audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data and uploads directories
RUN mkdir -p public/uploads data

# Expose port 8000
EXPOSE 8000

# Start the application with a high timeout and reload filtering to support 5GB uploads
# We only watch .py files to prevent the server from restarting during large video uploads
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-include", "*.py", "--timeout-keep-alive", "900"]
