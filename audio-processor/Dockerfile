FROM python:3.11-slim

# System deps: audio libs + build tools for madmom (Cython + gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    libsndfile1 \
    ffmpeg \
    rubberband-cli \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Cython first — madmom needs it at build time
RUN pip install --no-cache-dir Cython==3.0.11

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
