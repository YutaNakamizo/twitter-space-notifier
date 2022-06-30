import dotenv from 'dotenv';
import TwitterApi from 'twitter-api-v2';

dotenv.config()

const twitter = new TwitterApi.TwitterApi(process.env.NOTIF_TWITTER_KEY);

export const getUser = (username) => {
  return twitter.v2.userByUsername(username);
};

export const getSpacesByUsername = (username) => {
  return getUser(username).then(user => {
    return twitter.v2.spacesByCreators(user.data.id);
  });
};

