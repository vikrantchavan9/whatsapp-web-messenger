# -------------------------------------------------------
#   1) Base Image
# -------------------------------------------------------
FROM node:18-alpine AS builder

# -------------------------------------------------------
#   2) Install Dependencies
# -------------------------------------------------------
WORKDIR /app

# Copy only package files first
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build NestJS
RUN npm run build

# -------------------------------------------------------
#   3) Production Image
# -------------------------------------------------------
FROM node:18-alpine AS production

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled dist
COPY --from=builder /app/dist ./dist

# Copy prisma schema (required for migrations)
COPY --from=builder /app/prisma ./prisma

# -------------------------------------------------------
#   4) Start Command
# -------------------------------------------------------
CMD ["node", "dist/main.js"]
