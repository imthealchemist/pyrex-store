# Pyrex Store — explicit Docker build (bypasses Nixpacks/apt on Railway)
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
