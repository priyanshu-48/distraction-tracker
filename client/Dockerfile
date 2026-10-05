FROM node:22-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173
# Dev server; --host lets the published port reach it from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
