const dotenv = require('dotenv');
const TwitterApi = require('twitter-api-v2');

dotenv.config()

const twitter = new TwitterApi.TwitterApi(process.env.NOTIF_TWITTER_KEY);

const getUser = (username) => {
  return twitter.v2.userByUsername(username);
};

const getSpacesByUsername = (username) => {
  return getUser(username).then(user => {
    return twitter.v2.spacesByCreators(user.data.id);
  });
};

module.exports = {
  getUser,
  getSpacesByUsername,
};

