FROM node:14.19.1-alpine3.15

WORKDIR /usr/src/twitter-space-notifier/

COPY ./app/package*.json ./
RUN npm ci

COPY ./app/src/ ./src/

ENV TZ="Asia/Tokyo"

ENV GOOGLE_APPLICATION_CREDENTIALS="/etc/twitter-space-notifier/googleApplicationCredentials.json"

ENV NOTIF_TWITTER_KEY=""
ENV NOTIF_TARGETS=""
ENV NOTIF_INTERVAL="* */5 * * * *"

CMD [ "node", "src/index.js" ]

