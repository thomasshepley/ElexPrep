# ElexPrep — single-container build: Express API + built React UI + SQLite.
# Build:  docker compose build     Run:  docker compose up -d     (see DEPLOY.md)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY shared/ shared/
COPY server/ server/
COPY web/ web/
RUN npm run build --workspace @elexprep/shared \
 && cd server && npx prisma generate && npx tsc -p tsconfig.json && cd .. \
 && npm run build --workspace @elexprep/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/server/package.json server/
COPY --from=build /app/web/package.json web/
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/web/dist web/dist

ENV DATABASE_URL="file:/data/elexprep.db"
ENV UPLOADS_DIR="/data/uploads"
ENV WEB_DIST="/app/web/dist"
ENV PORT=4000
VOLUME /data
EXPOSE 4000

WORKDIR /app/server
CMD npx prisma migrate deploy && node dist/index.js
