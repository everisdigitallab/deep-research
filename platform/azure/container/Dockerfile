FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV APP_NAME=app
ENV APP_ENV=production
ENV APP_RUNTIME=azure-container
ENV APP_BASE_URL=http://localhost:3000
ENV API_BASE_PATH=/api
ENV DB_BINDING=DB
ENV BUCKET_BINDING=R2
ENV AI_ENABLED=false
ENV AZURE_DATA_MOUNT_PATH=/mnt/app-data
ENV SQLITE_PATH=/mnt/app-data/database/app.sqlite
ENV DOCUMENTS_PATH=/mnt/app-data/documents
ENV AUTO_RUN_MIGRATIONS=true
ENV AUTO_SEED_ON_EMPTY_DB=false

COPY app/package*.json ./
RUN npm ci --omit=dev --omit=optional

COPY app/src ./src
COPY app/public ./public
COPY app/migrations ./migrations
COPY app/generated ./generated
COPY app/package.json ./package.json
COPY app/seed.sql ./seed.sql
COPY webapp ./webapp

EXPOSE 3000

CMD ["npm", "run", "start:azure"]
