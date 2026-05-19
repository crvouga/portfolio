FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile || bun install

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    libxfixes3 libx11-xcb1 libxcb1 libx11-6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

RUN bunx playwright install chromium

COPY . .

RUN bun run build

FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
