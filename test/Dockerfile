FROM node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY test ./test
CMD ["node", "test/run.mjs"]
