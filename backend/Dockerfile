FROM node:20

# Install system Chromium + ALL required dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-common \
  chromium-driver \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxshmfence1 \
  libnss3 \
  libxss1 \
  libxtst6 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libxcb-dri3-0 \
  libgbm-dev \
  fonts-liberation \
  gstreamer1.0-gl \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-libav \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*
  
WORKDIR /app

# Install Chromium for whatsapp-web.js
RUN apt-get update && apt-get install -y chromium

COPY package.json package-lock.json ./

RUN npm install

COPY . .

# Build TypeScript → JavaScript (dist/)
RUN npm run build

EXPOSE 3001

# Start production NestJS
CMD ["npm", "run", "start:prod"]