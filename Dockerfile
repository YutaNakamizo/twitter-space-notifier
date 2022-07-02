FROM node:14.19.1-alpine3.15

WORKDIR /usr/src/twitter-spaces-notifier/

COPY ./app/package*.json ./
RUN npm ci

COPY ./app/src/ ./src/

ENV TZ="Asia/Tokyo"

ENV GOOGLE_APPLICATION_CREDENTIALS="/etc/twitter-spaces-notifier/googleApplicationCredentials.json"
ENV FIRESTORE_ENDPOINT_COLLECTION="endpoints"
ENV FIRESTORE_SPACES_COLLECTION="spaces"

ENV NOTIF_TWITTER_KEY=""
ENV NOTIF_TARGETS=""
ENV NOTIF_TARGET_BY_USERNAME=""
ENV NOTIF_TARGET_BY_USERID=""
ENV NOTIF_INTERVAL="* */5 * * * *"

ENV REDIS_URL=""
ENV REDIS_KEY_PREFIX="twsn"
ENV REDIS_KEY_SUFFIX=""

CMD [ "node", "src/index.js" ]

