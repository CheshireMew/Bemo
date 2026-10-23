# Build stage
FROM node:24.22.1-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_WEB_SYNC_PROXY_TOKEN
ENV VITE_WEB_SYNC_PROXY_TOKEN=$VITE_WEB_SYNC_PROXY_TOKEN
RUN npm run build

# Production stage
FROM nginx:1.30.6-alpine AS production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
