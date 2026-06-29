FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py cursor_tools.py ./
COPY static ./static

ENV DATA_DIR=/data
ENV PORT=8765
ENV PYTHONUNBUFFERED=1

VOLUME ["/data"]

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\",\"8765\")}/api/health', timeout=4)"

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8765}"]