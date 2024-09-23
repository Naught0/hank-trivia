import { Database } from "./database";
import { getQuestions } from "./trivia-api";
import { ICommand, Context, HankPDK, CommandConstructor } from "./types";
import {
  buildQuestionString,
  buildWinnersString,
  getIdFromMention,
  isMention,
  mention,
} from "./util";

export abstract class Command implements ICommand {
  public abstract commandNames: string[];
  constructor(
    protected hank: HankPDK,
    protected db: Database,
  ) {}

  async execute(ctx: Context): Promise<void> {}
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

    let content = "no content was set";
    if (userId) {
      const score = await ctx.db.getScoreByUserId(userId);
      if (!score) return ctx.reply(`${mention(userId)} has no points! Sad!`);

      content = `Total points for ${mention(userId)}: ${score.count} point${score.count > 1 ? "s" : ""}`;
    } else {
      const scores = await ctx.db.getAllTimeScores();
      content = `**Trivia** - All Time High Scores:\n${buildWinnersString(scores)}`;
    }

    ctx.reply(content);
  }
}

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): Command {
  return new command(hank, db);
}
