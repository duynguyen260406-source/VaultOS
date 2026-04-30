FROM node:20-alpine AS frontend

WORKDIR /app/react-app
COPY react-app/package.json react-app/vite.config.js react-app/index.html ./
COPY react-app/src ./src
RUN npm install
RUN npm run build

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=prod

WORKDIR /app

COPY requirements.lock.txt ./requirements.lock.txt
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY api ./api
COPY app ./app
COPY database ./database
COPY scripts ./scripts
COPY README.md ./README.md
COPY react-app/assets ./react-app/assets
COPY react-app/brand_assets ./react-app/brand_assets
COPY --from=frontend /app/react-app/dist ./react-app/dist

EXPOSE 8000

CMD ["sh", "-c", "python scripts/start_api.py --env ${APP_RUNTIME_ENV:-prod} --host 0.0.0.0 --port ${PORT:-8000}"]
