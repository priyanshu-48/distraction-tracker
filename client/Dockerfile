# Stage 1: build the dashboard. The API address and the extension id are fixed into the page at build time
# (the Content-Security-Policy added to the production build also allows that API address), so they are build arguments.
FROM node:22-slim AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_EXTENSION_ID=
ENV VITE_API_URL=$VITE_API_URL VITE_EXTENSION_ID=$VITE_EXTENSION_ID

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: serve the built files. Only the output is copied over, so the image has no Node, no source and no node_modules.
# This nginx image runs as a normal (non-root) user, which is why it listens on 8080 rather than 80.
FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
