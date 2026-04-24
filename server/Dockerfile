FROM node:20-alpine

WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./

# Copy workspace package.jsons
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies (workspaces)
RUN npm install

# Copy everything
COPY . .

# Build the server
WORKDIR /app/server
RUN npm run build

EXPOSE 3001

# Start the server
CMD ["npm", "run", "start"]
