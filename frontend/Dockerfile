# Build stage
FROM node:20-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine AS production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
# Note: In a real app we might need to proxy /api requests to backend here via custom nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
