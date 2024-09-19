import { Message } from "@hank.chat/types";
import { Database, GameState } from "./database";
import { TriviaResponse, TriviaResult, getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";

export async function handleMessage(input: HandleMessageInput) {
  const db = new Database(hank);
  const { message } = input;
  const activeGame = await db.getActiveGame(message.channelId);

  if (
    ["stats", "stat", "hiscores"].some((cmd) =>
      message.content.startsWith(`!${cmd}`),
    )
  ) {
    return await handleHiScores(db, message.channelId);
  }

  if (message.content.startsWith("!trivia")) {
    if (activeGame?.is_active) {
      return hank.sendMessage(
        Message.create({
          content: "Game already in progress",
          channelId: message.channelId,
        }),
      );
    }

    return await startGame(db, message.channelId);
  }
  if (!activeGame?.is_active) return;

  if (message.content.startsWith("!strivia")) {
    return await handleGameOver(db, message.channelId, activeGame.id);
  }

  // Monitor messages here
  const state = await db.getGameState(activeGame.id);
  const resp: TriviaResponse = JSON.parse(state.api_response);
  const question = resp.results[state.question_index];
  await handleGuess(
    db,
    activeGame.id,
    message.channelId,
    message.authorId,
    question,
    message.content,
    state.question_index,
    state.question_total,
  );
}

async function handleGuess(
  db: Database,
  gameId: number,
  channelId: string,
  userId: string,
  question: TriviaResult,
  guess: string,
  questionIndex: number,
  totalQuestions: number,
) {
  if (
    question.correct_answer.toLocaleLowerCase("en-US") ===
    guess.toLocaleLowerCase("en-US")
  ) {
    const nextIdx = questionIndex + 1;
    if (nextIdx >= totalQuestions) {
      return; // game over
    }

    await db.createScore(userId, gameId);
    const newState = await db.updateQuestionIndex(gameId, nextIdx);

    hank.sendMessage(
      Message.create({
        content: `Correct <@${userId}>! The answer was ${question.correct_answer}`,
        channelId,
      }),
    );

    sendQuestion(channelId, newState);
  }
}

async function hasActiveGame(db: Database, channelId: string) {
  const game = await db.getActiveGame(channelId);
  console.log("CURRENT GAME", JSON.stringify(game));
  return !!game;
}

function sendQuestion(channelId: string, state: GameState) {
  const question: TriviaResult = JSON.parse(state.api_response).results[
    state.question_index
  ];
  const multipleChoices = [
    ...question.incorrect_answers,
    question.correct_answer,
  ].map((a) => `• ${a}`);
  multipleChoices.sort();

  return hank.sendMessage(
    Message.create({
      content: `**Question ${state.question_index + 1} / ${state.question_total}**:
${question.question}${question.type === "multiple" ? `\n**Answers**:\n${multipleChoices.join("\n")}` : ""}`,
      channelId,
    }),
  );
}

async function startGame(db: Database, channelId: string, amount = 10) {
  if (await hasActiveGame(db, channelId))
    return hank.sendMessage(
      Message.create({ content: "Game already in progress", channelId }),
    );

  const game = await db.createGame(channelId);
  if (!game)
    return hank.sendMessage(
      Message.create({ content: "Error creating game", channelId }),
    );

  const response = getQuestions({ amount });
  const state = await db.initGameState({
    question_total: amount,
    question_index: 0,
    api_response: JSON.stringify(response),
    game_id: game.id,
  });

  hank.sendMessage(
    Message.create({
      content: "Starting trivia, use !strivia to stop",
      channelId,
    }),
  );
  sendQuestion(channelId, state);

  return response;
}

async function handleGameOver(db: Database, channelId: string, gameId: number) {
  await db.stopGame(gameId);
  const scores = await db.getGameScores(gameId);
  // Find number of ocurrences of each discord_user_id
  const winnersMap = scores.reduce(
    (acc, winner) => {
      acc[winner.discord_user_id] = (acc[winner.discord_user_id] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  // Get top 3 highest values in winnersMap
  const winners = Object.entries(winnersMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const medals = ["🥇", "🥈", "🥉"];
  hank.sendMessage(
    Message.create({
      content: `Game over! The winners are:\n${winners
        .map((w, idx) => `${medals[idx]} <@${w[0]}> - **${w[1]}**`)
        .join("\n")}`,
      channelId,
    }),
  );
}

async function handleHiScores(db: Database, channelId: string) {
  const scores = await db.getAllTimeScores();
  hank.sendMessage(
    Message.create({
      content: `Hi scores: ${JSON.stringify(scores)}`,
      channelId,
    }),
  );
}
