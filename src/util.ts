import { Message } from "@hank.chat/types";
import { decode } from "html-entities";
import { Database, Game, GameState, UserScore } from "./database";
import { defaultConfig } from "./defaults";
import { TriviaResponse, TriviaResult } from "./trivia-api";
import { Context, HankConfig, HankPDK } from "./types";

export function buildQuestionString(
  gameState: GameState,
  apiResponse: TriviaResponse,
) {
  const question = apiResponse.results[gameState.question_index];
  const isMultipleChoice = question.type === "multiple";
  const isTrueOrFalse = question.type === "boolean";
  const { choices } = getChoices(question);

  const content = `**Question ${gameState.question_index + 1} / ${gameState.question_total}**:
${isTrueOrFalse ? "True or False: " : ""}${decode(question.question)}${isMultipleChoice ? `\n**Answers**:\n${choices.join("\n")}` : ""}`;

  return content;
}

export function mention(id: string) {
  return `<@${id}>`;
}

export function getMedalByIndex(idx: number) {
  const medals = ["🥇", "🥈", "🥉"];
  return medals?.[idx] ?? "";
}

export function buildWinnersString(winners: UserScore[]) {
  return winners
    .map(
      (w, idx) =>
        `${getMedalByIndex(idx)} ${mention(w.discord_user_id)} - **${w.count}** point${
          w.count === 1 ? "" : "s"
        }`,
    )
    .join("\n");
}

export function isMention(msg?: string) {
  if (!msg) return false;

  return msg.startsWith("<@") && msg.endsWith(">");
}

export function getIdFromMention(msg: string) {
  return msg.slice(2, -1);
}

export function getMaxEditDistance(minAnswerLength: number) {
  if (minAnswerLength < 6) return 0;
  if (minAnswerLength > 12) return 3;

  return 2;
}

export function getChoices(question: TriviaResult): {
  choices: string[];
  answerIndex: number;
} {
  const isMultipleChoice = question.type === "multiple";
  if (!isMultipleChoice) {
    return {
      choices: [question.correct_answer, ...question.incorrect_answers],
      answerIndex: 0,
    };
  }

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

export async function fetchContext(
  hank: HankPDK,
  db: Database,
  message: Message,
): Promise<Context> {
  const activeGame = await db.getActiveGame(message.channelId);

  const config = await db.getConfig(message.channelId);
  if (activeGame) {
    const gameState = await db.getGameState(activeGame.id);
    const apiResponse = JSON.parse(gameState.api_response) as TriviaResponse;
    const currentQuestion = apiResponse.results[gameState.question_index];
    return createContext(
      hank,
      db,
      message,
      config ?? defaultConfig,
      activeGame,
      gameState,
      apiResponse,
      currentQuestion,
    );
  }
  return createContext(
    hank,
    db,
    message,
    config ?? defaultConfig,
    null,
    null,
    null,
    null,
  );
}

export function createContext(
  hank: HankPDK,
  db: Database,
  message: Message,
  config: HankConfig,
  game: Game | null,
  gameState: GameState | null,
  response: TriviaResponse | null,
  currentQuestion: TriviaResult | null,
): Context {
  const [command, ...args] = message.content.split(" ");
  const activeGame = game?.is_active
    ? {
        game,
        gameState: gameState!,
        response: response!,
        currentQuestion: currentQuestion!,
      }
    : null;
  return {
    db,
    config,
    message,
    command,
    args,
    reply: (content: string) =>
      hank.sendMessage(
        Message.create({ content, channelId: message.channelId }),
      ),
    activeGame,
  };
}
