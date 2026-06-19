FROM python:3.10-slim

# System deps: audio libs + build tools for madmom (Cython + gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    libsndfile1 \
    ffmpeg \
    rubberband-cli \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Step 1: install numpy + Cython BEFORE madmom so --no-build-isolation can use them
RUN pip install --no-cache-dir "numpy==1.23.5" "Cython==3.0.11" "scipy==1.11.4"

# Step 2: install madmom WITHOUT build isolation — reuses numpy 1.23.5 (has numpy.bool)
RUN pip install --no-cache-dir --no-build-isolation madmom==0.16.1

# Step 3: install remaining runtime deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
