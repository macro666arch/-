FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    FASTEMBED_CACHE_PATH=/tmp/fastembed_cache \
    HF_HOME=/tmp/hf_cache

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY embedding_server.py .

EXPOSE 9430
CMD ["python", "embedding_server.py"]
