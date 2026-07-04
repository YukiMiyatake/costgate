FROM node:22-bookworm
WORKDIR /mock
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || true
COPY index.mjs ./
CMD ["node", "index.mjs"]
