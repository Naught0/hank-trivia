import { Database } from "./database";
import { TriviaResult, getQuestions } from "./trivia-api";
import { ICommand, Context, HankPDK, CommandConstructor } from "./types";
import {
  buildQuestionString,
  buildWinnersString,
  getChoices,
  getIdFromMention,
  getMaxEditDistance,
  isMention,
  mention,
} from "./util";

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

    const newGame = await this.db.createGame(ctx.message.channelId);
    if (!newGame) {
      return ctx.reply("Error creating game");
    }

    try {
      const response = getQuestions({
        amount: ctx.args[0] ? parseInt(ctx.args[0]) : 10,
      });
      const gameState = await this.db.initGameState({
        question_total: response.results.length,
        question_index: 0,
        api_response: JSON.stringify(response),
        game_id: newGame.id,
      });

      ctx.reply("Starting trivia, use !strivia to stop");
      ctx.reply(buildQuestionString(gameState, response));
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

  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;

    const { answerIndex, choices } = getChoices(ctx.activeGame.currentQuestion);
    const isCorrect = await this.checkAnswer(
      ctx.message.content,
      choices[answerIndex],
      ctx.activeGame.currentQuestion,
    );
    if (!isCorrect) return;

    await this.db.createScore(ctx.message.authorId, ctx.activeGame.game.id);
    ctx.reply(
      `Correct ${mention(ctx.message.authorId)}! The answer was: ${choices[answerIndex]}`,
    );
    await this.nextRound(ctx);
  }

  private async nextRound(ctx: Context) {
    if (!ctx.activeGame) throw Error("Cannot  without active game.");

    const nextIdx = ctx.activeGame.gameState.question_index + 1;
    if (nextIdx >= ctx.activeGame.gameState.question_total) {
      const stopTriviaCmd = new StopTrivia(this.hank, this.db);
      await stopTriviaCmd.execute(ctx);
    } else {
      const newGameState = await this.db.updateQuestionIndex(
        ctx.activeGame.game.id,
        nextIdx,
      );
      ctx.reply(buildQuestionString(newGameState, ctx.activeGame.response));

      // TODO: See why this isn't called
      this.hank.oneShot(5, () => this.timeExpired(ctx));
    }
  }

  private async timeExpired(ctx: Context) {
    console.log("Executing oneshot");
    if (!ctx.activeGame) return;

    const currentGame = await this.db.getActiveGame(ctx.message.channelId);
    if (!currentGame) return;

    const currentState = await this.db.getGameState(currentGame.id);
    if (currentState.question_index > ctx.activeGame.gameState.question_index)
      return;

    ctx.reply(
      `**Time's up!** The answer was: ${ctx.activeGame.currentQuestion.correct_answer}`,
    );
    await this.nextRound(ctx);
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

      const { levenshteinEditDistance } = await import(
        "levenshtein-edit-distance"
      );
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

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): Command {
  return new command(hank, db);
}
