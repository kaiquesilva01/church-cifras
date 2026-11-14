FROM node:22-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/functions/package.json apps/functions/package.json
COPY packages/chords/package.json packages/chords/package.json
COPY tests/package.json tests/package.json

RUN npm ci
