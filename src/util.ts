import { decode } from "html-entities";
import { GameState, UserScore } from "./database";
import { TriviaResponse, TriviaResult } from "./trivia-api";
import { Context, HankPDK } from "./types";
import { StopTrivia } from "./commands/stop";
import { fetchContext } from "./context";

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
  return msg.replace(/^<@|>$/g, "");
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

export async function queueExpiredRoundCheck(
  hank: HankPDK,
  ctx: Context,
  timeout: number = 15,
) {
  if (!ctx.activeGame) return;

  hank.oneShot(timeout, () => onTimeExpired(hank, ctx));
}

export async function onTimeExpired(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame) return;

  const previousId = ctx.activeGame.game.id;
  const currentGame = await ctx.client.db.getActiveGame(ctx.message.channelId);
  if (!currentGame) return;
  // New game started
  if (currentGame.id !== previousId) return;

  const currentState = await ctx.client.db.getGameState(currentGame.id);
  if (currentState.question_index !== ctx.activeGame.gameState.question_index)
    return;

  ctx.reply(
    `**Time's up!** The answer was: ${ctx.activeGame.currentQuestion.correct_answer}`,
  );
  await nextRound(hank, ctx);
}

export async function startRound(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame) return;

  ctx.reply(
    buildQuestionString(ctx.activeGame.gameState, ctx.activeGame.response),
  );
  queueExpiredRoundCheck(hank, ctx);
}

export async function nextRound(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame) return;

  const nextIdx = ctx.activeGame.gameState.question_index + 1;
  if (nextIdx >= ctx.activeGame.gameState.question_total) {
    const stopTriviaCmd = new StopTrivia(hank, ctx.client.db);
    await stopTriviaCmd.execute({ ...ctx, command: "stop", args: [] });
  } else {
    await ctx.client.db.updateQuestionIndex(ctx.activeGame.game.id, nextIdx);
    const newCtx = await fetchContext(hank, ctx.client, ctx.message);
    startRound(hank, newCtx);
  }
}

export const jsonLog = (...objs: object[]) =>
  console.log(objs.map((obj) => JSON.stringify(obj, null, 2)).join("\n"));

export const createHelpText = (
  commands: string[],
  summary: string,
  args?: string[],
) => {
  const hasAliases = commands.length > 1;

  return `${summary}\nUsage:\n\t${hasAliases ? "(" : ""}${commands.join("|")}${hasAliases ? ") " : ""} ${args && args.length ? args.map((a) => `<${a}>`).join(" ") : ""}`;
};
