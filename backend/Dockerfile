FROM python:3.12-slim

ARG INSTALL_DEV=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-dev.txt ./
RUN if [ "$INSTALL_DEV" = "true" ]; then req=requirements-dev.txt; else req=requirements.txt; fi \
    && pip install --no-cache-dir -r "$req"

RUN useradd --system --uid 1000 --no-create-home app
COPY . .
USER app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
