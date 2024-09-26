import { Database, TriviaConfigKey } from "./database";
import { TriviaResult, getQuestions } from "./trivia-api";
import { ICommand, Context, HankPDK, CommandConstructor } from "./types";
import {
  buildQuestionString,
  buildWinnersString,
  createContext,
  fetchContext,
  getChoices,
  getIdFromMention,
  getMaxEditDistance,
  isMention,
  mention,
} from "./util";
import { validTimeout } from "./validate";
import { levenshteinEditDistance } from "levenshtein-edit-distance";

export class Command implements ICommand {
  public commandNames: string[] = [];
  constructor(
    protected hank: HankPDK,
    protected db: Database,
  ) {}
  async execute(_: Context) {}
}

export class StartTrivia extends Command {
  commandNames = ["trivia", "t"];

  async execute(ctx: Context): Promise<void> {
    if (ctx.activeGame?.game.is_active) {
      return ctx.reply("Game already in progress");
    }

    const newGame = await ctx.db.createGame(ctx.message.channelId);
    if (!newGame) {
      return ctx.reply("Error creating game");
    }

    try {
      const response = getQuestions({
        amount: parseInt(ctx.args[0] ?? ctx.config.question_total),
      });
      const gameState = await this.db.initGameState({
        question_total: response.results.length,
        question_index: 0,
        api_response: JSON.stringify(response),
        game_id: newGame.id,
      });

      ctx.reply("Starting trivia, use !strivia to stop");
      return startRound(
        this.hank,
        createContext(
          this.hank,
          this.db,
          ctx.message,
          ctx.config,
          newGame,
          gameState,
          response,
          response.results[gameState.question_index],
        ),
      );
    } catch (error) {
      return ctx.reply("Number of questions must be between 1 and 20");
    }
  }
}

export class StopTrivia extends Command {
  commandNames = ["strivia", "stop"];
  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;
    if (!ctx.activeGame) return;

    await ctx.db.stopGame(ctx.activeGame.game.id);
    const scores = await ctx.db.getGameScores(ctx.activeGame.game.id);
    const content = `Game over! The winners are:\n${buildWinnersString(scores)}`;
    ctx.reply(content);
  }
}

export class SetDefaultTimeout extends Command {
  commandNames = ["timeout", "roundlen"];
  help = "Set the default round length.\nUsage: `!timeout <seconds>`";

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }
    const timeout = parseInt(ctx.args[0]);
    if (!validTimeout(timeout)) {
      return ctx.reply("Timeout must be between 10 and 60 seconds");
    }

    await ctx.db.setRoundTimeout(ctx.message.channelId, timeout);
    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}

export class SetDefaultQuestionCount extends Command {
  commandNames = ["count", "total"];
  help = `Set the default number of questions.\nUsage: \`!${this.commandNames[0]} <number>\`\nAliases: \`!${this.commandNames.join(", ")}\``;

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }

    const count = parseInt(ctx.args[0]);
    if (count < 1 || count > 20) {
      return ctx.reply("Number of questions must be between 1 and 20");
    }

    try {
      await ctx.db.setDefaultQuestionCount(ctx.message.channelId, count);
    } catch (error) {
      error;
      return;
    }

    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}

export class HiScores extends Command {
  commandNames = ["hiscores", "leaderboard", "scores", "stats", "stat"];
  async execute(ctx: Context): Promise<void> {
    const isSelf = ctx.args[0] === "self" || ctx.args[0] === "me";
    const hasMention = isMention(ctx.args[0]);
    const userId = isSelf
      ? ctx.message.authorId
      : hasMention
        ? getIdFromMention(ctx.args[0])
        : null;

    if (userId) {
      const score = await ctx.db.getScoreByUserId(userId);
      if (!score) return ctx.reply(`${mention(userId)} has no points! Sad!`);

      return ctx.reply(
        `Total points for ${mention(userId)}: ${score.count} point${score.count > 1 ? "s" : ""}`,
      );
    } else {
      const scores = await ctx.db.getAllTimeScores();
      return ctx.reply(
        `**Trivia** - All Time High Scores:\n${buildWinnersString(scores)}`,
      );
    }
  }
}

export class OnMessage extends Command {
  commandNames = [];
  default_timeout = 20;

  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;

    const { answerIndex, choices } = getChoices(ctx.activeGame.currentQuestion);
    const isCorrect = await this.checkAnswer(
      ctx.message.content,
      choices[answerIndex],
      ctx.activeGame.currentQuestion,
    );
    if (!isCorrect) return;

    await ctx.db.createScore(ctx.message.authorId, ctx.activeGame.game.id);
    ctx.reply(
      `Correct ${mention(ctx.message.authorId)}! The answer was: ${choices[answerIndex]}`,
    );
    await nextRound(this.hank, ctx);
  }

  private async checkAnswer(
    guess: string,
    correctAnswer: string,
    question: TriviaResult,
  ): Promise<boolean> {
    const questionType = question.type;
    if (questionType === "boolean") {
      return guess.toLowerCase() === correctAnswer.toLowerCase();
    }
    if (questionType === "multiple") {
      const isCorrect = guess.toLowerCase() === correctAnswer[2].toLowerCase();
      if (isCorrect) return isCorrect;

      const minAnswerLength = Math.min(
        ...[question.incorrect_answers, question.correct_answer].map(
          (a) => a.length,
        ),
      );
      const maxDistance = getMaxEditDistance(minAnswerLength);

      const editDistance = levenshteinEditDistance(
        guess,
        correctAnswer.slice(7),
        true,
      );
      return editDistance <= maxDistance;
    }

    return false;
  }
}

async function queueExpiredRoundCheck(
  hank: HankPDK,
  ctx: Context,
  timeout: number = 15,
) {
  if (!ctx.activeGame) return;

  hank.oneShot(timeout, () => timeExpired(hank, ctx));
}

async function timeExpired(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame) return;

  const currentGame = await ctx.db.getActiveGame(ctx.message.channelId);
  if (!currentGame) return;

  const currentState = await ctx.db.getGameState(currentGame.id);
  if (currentState.question_index !== ctx.activeGame.gameState.question_index)
    return;

  ctx.reply(
    `**Time's up!** The answer was: ${ctx.activeGame.currentQuestion.correct_answer}`,
  );
  await nextRound(hank, ctx);
}

async function startRound(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame)
    return console.log("Context contains no active game. Cannot start round");

  ctx.reply(
    buildQuestionString(ctx.activeGame.gameState, ctx.activeGame.response),
  );
  queueExpiredRoundCheck(hank, ctx);
}

async function nextRound(hank: HankPDK, ctx: Context) {
  if (!ctx.activeGame) return;

  const nextIdx = ctx.activeGame.gameState.question_index + 1;
  if (nextIdx >= ctx.activeGame.gameState.question_total) {
    const stopTriviaCmd = new StopTrivia(hank, ctx.db);
    await stopTriviaCmd.execute(ctx);
  } else {
    await ctx.db.updateQuestionIndex(ctx.activeGame.game.id, nextIdx);
    const newCtx = await fetchContext(hank, ctx.db, ctx.message);
    startRound(hank, newCtx);
  }
}

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): Command {
  return new command(hank, db);
}
