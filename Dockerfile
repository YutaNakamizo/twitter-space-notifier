FROM node:14.19.1-alpine3.15

# Add Tini
RUN apk add --no-cache tini
ENTRYPOINT [ "/sbin/tini", "--" ]

# Build app
WORKDIR /usr/src/twitter-spaces-notifier/

COPY ./app/package*.json ./
RUN npm ci

COPY ./app/src/ ./src/

ENV TZ="Asia/Tokyo"

ENV GOOGLE_APPLICATION_CREDENTIALS="/etc/twitter-spaces-notifier/googleApplicationCredentials.json"

ENV NOTIF_TWITTER_KEY=""
ENV NOTIF_TARGETS=""
ENV NOTIF_INTERVAL="* */5 * * * *"
ENV FIRESTORE_ENDPOINT_COLLECTION="endpoints"
ENV FIRESTORE_SPACES_COLLECTION="spaces"
ENV REDIS_URL=""
ENV REDIS_KEY_PREFIX="twsn"
ENV REDIS_KEY_SUFFIX=""

CMD [ "node", "src/index.js" ]

