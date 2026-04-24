FROM node:20-alpine

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/ ./shared/

# Install dependencies for all workspaces
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the server (and shared if needed)
WORKDIR /app/server
RUN npm run build

# Ensure we're in the server directory for the start command
WORKDIR /app/server

EXPOSE 4001

CMD ["npm", "start"]
