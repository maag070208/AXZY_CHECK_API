FROM node:20-bullseye AS builder
# Create app directory
WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
COPY swagger.yaml ./
COPY prisma ./prisma/
COPY yarn.lock ./
COPY .env ./

# Install app dependencies
RUN yarn

COPY . .

RUN npx prisma generate

RUN npx prisma db seed

RUN yarn build


FROM node:18-alpine

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/swagger.yaml ./
COPY --from=builder /app/.env ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./dist/src/public

EXPOSE 4321

CMD [ "yarn", "start" ]