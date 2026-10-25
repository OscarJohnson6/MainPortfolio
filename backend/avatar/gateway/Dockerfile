# Avatar gateway — the always-on part (your PC now, the Pi later).
# The worker is not containerized: it needs Ollama and the GPU on the host.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DB_PATH=/data/avatars.db

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py persona.md ./

# The SQLite database lives on a volume so it survives rebuilds.
VOLUME ["/data"]

EXPOSE 8200
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8200"]
