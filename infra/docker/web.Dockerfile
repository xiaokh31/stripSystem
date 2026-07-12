FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /workspace

COPY . .
