import { Message } from "@hank.chat/types";
import { Database } from "./database";
import { getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";

export async function handleMessage(input: HandleMessageInput) {
  const db = new Database(hank);
  const { message } = input;
  const activeGame = await db.getActiveGame(message.channelId);

  if (message.content.startsWith("!trivia")) {
    if (activeGame?.is_active) {
      return hank.sendMessage(
        Message.create({
          content: "Game already in progress",
          channelId: message.channelId,
        }),
      );
    }

    console.log("WE STARTIN TRIVIA");
    return await startGame(db, message.channelId);
  }
  if (!activeGame?.is_active) return;

  if (message.content.startsWith("!strivia")) {
    return await stopGame(db, message.channelId, activeGame.id);
  }
}

async function hasActiveGame(db: Database, channelId: string) {
  const game = await db.getActiveGame(channelId);
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
  console.log("Got response");
  const gameState = await db.createGameState({
    question_total: amount,
    question_index: 0,
    api_response: JSON.stringify(response),
    game_id: resp.id,
  });

  hank.sendMessage(
    Message.create({
      content: "Starting trivia, use !strivia to stop",
      channelId,
    }),
  );
  // begin game

  await stopGame(db, channelId, gameState.game_id);
}

async function stopGame(db: Database, channelId: string, gameId: number) {
  await db.stopGame(gameId);
  // TODO: Calculate winner here
  return hank.sendMessage(
    Message.create({ content: "Ok trivia stopped!", channelId }),
  );
}
