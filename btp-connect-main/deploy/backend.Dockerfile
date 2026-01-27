FROM node:18-alpine AS build
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci
COPY backend ./backend
RUN npm --prefix backend run build

FROM node:18-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/package*.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
# Static PWA assets are served by backend at runtime if present in dist build output.
EXPOSE 3000
CMD ["node","dist/server.js"]
