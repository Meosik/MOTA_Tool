FROM node:20-slim

WORKDIR /app

# only copy dependency files first
COPY package.json package-lock.json* ./

# install inside the container
RUN npm install

# copy rest of source
COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
