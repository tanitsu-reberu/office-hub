FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY static ./static

ENV DATA_DIR=/data
ENV PORT=8765

VOLUME ["/data"]

EXPOSE 8765

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}