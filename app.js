const express = require("express");
const app = express();

app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDataBaseServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running on Port Number 3000");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDataBaseServer();

//TO create a user

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isUserThereQuery = `SELECT * FROM user WHERE username='${username}';`;
  const result = await db.get(isUserThereQuery);
  if (result === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const toAddNewUserQuery = `INSERT INTO 
          user(name,username, password, gender) 
          VALUES ('${name}','${username}'
          ,'${hashedPassword}', '${gender}');`;
      await db.run(toAddNewUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//To Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserThereCheckQuery = `SELECT * FROM user WHERE username='${username}';`;
  const result = await db.get(isUserThereCheckQuery);
  if (result !== undefined) {
    const isPasswordSameCheck = await bcrypt.compare(password, result.password);
    if (isPasswordSameCheck) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "MyNameIsSaiKrishna");
      console.log(jwtToken);
      response.status(200);
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//Authenticate JWT Token

const authenticateJwtToken = async (request, response, next) => {
  const authorization = request.headers.authorization;
  if (authorization !== undefined) {
    const jwtToken = authorization.split(" ")[1];
    await jwt.verify(jwtToken, "MyNameIsSaiKrishna", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//To return the latest tweets of people whom the user follows.
// Return 4 tweets at a time

app.get(
  "/user/tweets/feed/",
  authenticateJwtToken,
  async (request, response) => {
    const username = request.username;
    const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
    const userData = await db.get(toKnowFollowerUserId);
    const sqlQuery = `SELECT fj.username,tweet,date_time AS dateTime 
    FROM (user INNER JOIN follower ON user.user_id=follower.following_user_id) 
    AS fj INNER JOIN tweet ON fj.following_user_id=tweet.user_id 
    WHERE follower_user_id='${userData.user_id}' ORDER BY tweet.date_time DESC LIMIT 4;`;
    const result = await db.all(sqlQuery);
    response.send(result);
  }
);

//To return the list of all names of people whom the user follows

app.get("/user/following/", authenticateJwtToken, async (request, response) => {
  const username = request.username;
  const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const userData = await db.get(toKnowFollowerUserId);
  const whomUserFollowingQuery = `SELECT name 
    FROM follower INNER JOIN user ON following_user_id=user_id 
    WHERE follower_user_id=${userData.user_id};`;
  const result = await db.all(whomUserFollowingQuery);
  response.send(result);
});

//To return the list of all names of people who follows the user

app.get("/user/followers/", authenticateJwtToken, async (request, response) => {
  const username = request.username;
  const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const userData = await db.get(toKnowFollowerUserId);
  const WhoIsFollowingUserQ = `SELECT name 
  FROM follower INNER JOIN user ON follower_user_id=user_id 
  WHERE following_user_id=${userData.user_id};`;
  const result = await db.all(WhoIsFollowingUserQ);
  response.send(result);
});

//To get a tweet based on tweetId

app.get(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
    const userData = await db.get(toKnowFollowerUserId);

    const toGetUserFollowingUsersTweetsQuery = `SELECT tweet.tweet
    ,(SELECT COUNT(like_id) FROM like WHERE tweet_id=tweet.tweet_id) AS likes
    ,(SELECT COUNT(reply_id) FROM reply WHERE tweet_id=tweet.tweet_id) AS replies
    ,tweet.date_time AS dateTime 
    FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id 
    WHERE follower.follower_user_id=${userData.user_id} AND tweet.tweet_id=${tweetId};`;
    const [result] = await db.all(toGetUserFollowingUsersTweetsQuery);
    if (result === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(result);
    }
  }
);

//To get likes of a tweet if user following

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
    const userData = await db.get(toKnowFollowerUserId);

    const toKnowWhoLikesTweetQuery = `SELECT user.username FROM follower INNER JOIN tweet 
    ON follower.following_user_id=tweet.user_id INNER JOIN like 
    ON tweet.tweet_id=like.tweet_id INNER JOIN user 
    ON like.user_id=user.user_id 
    WHERE follower.follower_user_id=${userData.user_id} AND tweet.tweet_id=${tweetId};`;
    const result = await db.all(toKnowWhoLikesTweetQuery);
    if (result.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likedPersonsArray = [];
      for (let each of result) {
        likedPersonsArray.push(each.username);
      }
      response.send({ likes: likedPersonsArray });
    }
  }
);

//To get the replies of a tweet following by the user

app.get(
  "/tweets/:tweetId/replies/",
  authenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
    const userData = await db.get(toKnowFollowerUserId);

    const toGetRepliesOfATweetQuery = `SELECT user.name,reply.reply 
    FROM follower INNER JOIN tweet 
    ON follower.following_user_id=tweet.user_id INNER JOIN reply 
    ON tweet.tweet_id=reply.tweet_id INNER JOIN user 
    ON reply.user_id=user.user_id 
    WHERE follower.follower_user_id=${userData.user_id} 
    AND tweet.tweet_id=${tweetId};`;
    const result = await db.all(toGetRepliesOfATweetQuery);
    if (result.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: result });
    }
  }
);

//To return a list of all tweets of the user

app.get("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const username = request.username;
  const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const userData = await db.get(toKnowFollowerUserId);

  const toGetTweetsOfUserQuery = `SELECT tweet,(
SELECT COUNT(like_id)
FROM like
WHERE tweet_id=tweet.tweet_id
) AS likes,
(
SELECT COUNT(reply_id)
FROM reply
WHERE tweet_id=tweet.tweet_id
) AS replies,date_time AS dateTime FROM tweet WHERE user_id=${userData.user_id};`;
  const result = await db.all(toGetTweetsOfUserQuery);
  response.send(result);
});

//To create a tweet in the tweet table

app.post("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { tweet } = request.body;
  const username = request.username;
  const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const userData = await db.get(toKnowFollowerUserId);
  const date = new Date();
  const toGetMonth = (month) => {
    if (month === 9) {
      return 10;
    } else if (String(month).length === 1) {
      return "0" + (month + 1);
    } else {
      return month;
    }
  };
  const neededDateTime = `${date.getFullYear()}-${toGetMonth(
    date.getMonth()
  )}-${
    String(date.getDate()).length === 1 ? "0" + date.getDate() : date.getDate()
  } ${
    String(date.getHours()).length === 1
      ? "0" + date.getHours()
      : date.getHours()
  }:${
    String(date.getMinutes()).length === 1
      ? "0" + date.getMinutes()
      : date.getMinutes()
  }:${
    String(date.getSeconds()).length === 1
      ? "0" + date.getSeconds()
      : date.getSeconds()
  }`;
  const toCreateATweetQuery = `INSERT INTO tweet(tweet,user_id,date_time) 
  VALUES ('${tweet}',${userData.user_id},'${neededDateTime}');`;
  await db.run(toCreateATweetQuery);
  response.send("Created a Tweet");
});

//To Delete A Tweet based On TweetId

app.delete(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const toKnowFollowerUserId = `SELECT * FROM user WHERE username LIKE '${username}';`;
    const userData = await db.get(toKnowFollowerUserId);

    const isIttHisTweetCheckQuery = `SELECT * FROM tweet WHERE user_id=${userData.user_id} 
    AND tweet_id=${tweetId};`;
    const result = await db.all(isIttHisTweetCheckQuery);
    if (result.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const toDeleteTweetQuery = `DELETE FROM tweet 
        WHERE tweet.user_id=${userData.user_id} AND tweet_id=${tweetId};`;
      await db.run(toDeleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
