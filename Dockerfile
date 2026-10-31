FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies list
COPY backend/requirements.txt ./requirements.txt

# Install PyTorch CPU and requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend ./backend
COPY ai ./ai
COPY models/weights ./models/weights

# Environment variable settings
ENV PYTHONPATH=/app/backend:/app
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend"]
