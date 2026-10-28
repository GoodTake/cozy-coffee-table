# Any language works as long as the project has a Dockerfile exposing a port with a /health route.
FROM node:24-bookworm-slim
WORKDIR /app
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
