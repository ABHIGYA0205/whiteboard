FROM node:22-alpine

WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./

# Copy workspace package.jsons
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Install all dependencies (workspaces)
RUN npm ci

# Copy everything
COPY . .

# Build the client
WORKDIR /app/client
ARG INTERNAL_API_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
RUN npm run build

EXPOSE 3000

# Start the client
CMD ["npm", "run", "start"]
