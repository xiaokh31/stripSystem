FROM mcr.microsoft.com/playwright:v1.61.1-noble

RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile=false --ignore-scripts

ENTRYPOINT ["pnpm", "--filter", "web", "exec", "playwright", "test"]
