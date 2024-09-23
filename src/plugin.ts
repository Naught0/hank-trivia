import { Message } from "@hank.chat/types";
import { Database, Game, GameState } from "./database";
import { TriviaResponse, TriviaResult, getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";
import { decode } from "html-entities";

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
  const { answerIndex, choices } = getMultipleChoiceAnswers(question);

  await handleGuess({
    db,
    state,
    choices,
    activeGame,
    answerIndex,
    guess: message.content,
    userId: message.authorId,
    questionType: question.type,
    questionIndex: state.question_index,
  });
}

async function handleGuess({
  activeGame,
  answerIndex,
  choices,
  db,
  guess,
  questionIndex,
  questionType,
  state,
  userId,
}: {
  activeGame: Game;
  answerIndex: number;
  choices: string[];
  db: Database;
  guess: string;
  questionIndex: number;
  questionType: string;
  state: GameState;
  userId: string;
}) {
  const { levenshteinEditDistance } = await import("levenshtein-edit-distance");

  // Wrong answer
  switch (questionType) {
    case "multiple":
      const guessIndex = choices.findIndex(
        (answer) => answer[2].toLowerCase() === guess.toLowerCase(),
      );
      if (answerIndex !== guessIndex) return;
      break;

    default:
      const editDistance = levenshteinEditDistance(
        guess,
        choices[answerIndex],
        true,
      );
      if (editDistance > 2) return;
      break;
  }

  const nextIdx = questionIndex + 1;
  const gameOver = nextIdx >= state.question_total;

  await db.createScore(userId, activeGame.id);
  sendCorrectMessage({
    userId,
    answer: choices[answerIndex],
    channelId: activeGame.channel_id,
  });
  if (gameOver)
    return await handleGameOver(db, activeGame.channel_id, activeGame.id);

  const newState = await db.updateQuestionIndex(activeGame.id, nextIdx);
  sendQuestion(activeGame.channel_id, newState);
}

function sendCorrectMessage({
  channelId,
  userId,
  answer,
}: {
  userId: string;
  answer: string;
  channelId: string;
}) {
  hank.sendMessage(
    Message.create({
      content: `Correct <@${userId}>! The answer was: ${answer}`,
      channelId,
    }),
  );
}

async function hasActiveGame(db: Database, channelId: string) {
  const game = await db.getActiveGame(channelId);
  return !!game;
}

function getMultipleChoiceAnswers(question: TriviaResult) {
  const isMultipleChoice = question.type === "multiple";
  if (!isMultipleChoice)
    return {
      choices: [question.correct_answer, ...question.incorrect_answers],
      answerIndex: 0,
    };

  const alphabet = ["A", "B", "C", "D", "E"];
  const correctAnswer = decode(question.correct_answer);
  const decodedAnswers = [
    ...question.incorrect_answers,
    question.correct_answer,
  ].map((c) => decode(c));
  decodedAnswers.sort();
  const choices = decodedAnswers.map((c, idx) => `**${alphabet[idx]}**. ${c}`);

  return {
    choices,
    answerIndex: decodedAnswers.findIndex((c) => c === correctAnswer),
  };
}

function parseApiResponse(apiResponse: string): TriviaResponse {
  return JSON.parse(apiResponse);
}

function sendQuestion(channelId: string, state: GameState) {
  const question: TriviaResult = parseApiResponse(state.api_response).results[
    state.question_index
  ];
  const isMultipleChoice = question.type === "multiple";
  const isTrueOrFalse = question.type === "boolean";
  const { choices } = getMultipleChoiceAnswers(question);

  return hank.sendMessage(
    Message.create({
      content: `**Question ${state.question_index + 1} / ${state.question_total}**:
${isTrueOrFalse ? "True or False: " : ""}${decode(question.question)}${isMultipleChoice ? `\n**Answers**:\n${choices.join("\n")}` : ""}`,
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
        .map((w, idx) => `${medals[idx]} <@${w[0]}> - **${w[1]}** points`)
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
