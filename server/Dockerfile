FROM node:22-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
# Apply migrations (idempotent), then start the API.
CMD ["sh", "-c", "node db/migrate.js && node server.js"]
