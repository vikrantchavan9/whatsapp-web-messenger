# ----------------------------
# 1) Build Stage
# ----------------------------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ----------------------------
# 2) Production Stage (Nginx)
# ----------------------------
FROM nginx:alpine

# Copy build output to Nginx
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
