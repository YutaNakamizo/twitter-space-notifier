FROM node:14.19.1-alpine3.15

WORKDIR /usr/src/notif-app/

COPY ./package*.json ./
RUN npm ci

COPY ./src/ ./src/

ENV TZ="Asia/Tokyo"

ENV GOOGLE_APPLICATION_CREDENTIALS=""
ENV NOTIF_TARGETS=""

ENV NOTIF_TWITTER_KEY=""
ENV NOTIF_INTERVAL="* */5 * * * *"

CMD [ "node", "src/index.js" ]

