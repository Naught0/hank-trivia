import { Message } from "@hank.chat/types";
import { Database } from "./database";
import { getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";
import { db } from ".";

// Using global hank works for everything
// passing it around doesn't work
// NEed to see return type from database queries
// NEed to figure out if shit is async or not
export function handleMessage(input: HandleMessageInput) {
  const { message } = input;

  if (message.content === "!trivia") {
    console.log("WE STARTIN TRIVIA");
    db.createTables();
    return startGame(db, message.channelId);
  }

  if (!message.content.startsWith("!strivia")) {
    return stopGame(db, message.channelId);
  }

  const gameId = db.getCurrentGame(message.channelId);
  if (!gameId)
    return hank.sendMessage({ ...message, content: "No game in progress" });
}

async function hasActiveGame(db: Database, channelId: string) {
  const game = await db.getCurrentGame(channelId);
  console.log("CURRENT GAME", JSON.stringify(game));
  return !!game;
}

async function startGame(db: Database, channelId: string, amount = 10) {
  if (await hasActiveGame(db, channelId))
    return hank.sendMessage(
      Message.create({ content: "Game already in progress", channelId }),
    );

  const resp = await db.createGame(channelId);
  const response = getQuestions({ amount });
  const gameState = await db.createGameState({
    question_total: amount,
    question_index: 0,
    api_response: JSON.stringify(response),
    game_id: resp.id,
  });

  hank.sendMessage(
    Message.create({ content: JSON.stringify(gameState), channelId }),
  );
  // begin game
  stopGame(db, channelId);
}

async function stopGame(db: Database, channelId: string) {
  if (!hasActiveGame(db, channelId))
    return hank.sendMessage(
      Message.create({ content: "No game in progress", channelId }),
    );

  db.stopGame(channelId);
  // TODO: Calculate winner here
  return hank.sendMessage(
    Message.create({ content: "Ok trivia stopped!", channelId }),
  );
}
