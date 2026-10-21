FROM node:20-alpine

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/ ./shared/

# Install dependencies for all workspaces
RUN npm install

# Copy source code
COPY . .

# Build the server
WORKDIR /app/server
RUN npm run build

EXPOSE 4001

CMD ["npm", "start"]
