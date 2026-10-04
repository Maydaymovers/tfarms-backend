FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npx prisma generate
RUN npx prisma migrate deploy
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
