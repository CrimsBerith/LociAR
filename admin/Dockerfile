FROM node:22-bookworm-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install dependencies first for optimal layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

EXPOSE 3000

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
