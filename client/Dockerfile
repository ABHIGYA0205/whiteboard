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

# Build the client
WORKDIR /app/client
RUN npm run build

EXPOSE 3000

# Start the client
CMD ["npm", "run", "start"]
