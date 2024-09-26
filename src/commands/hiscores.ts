import { Context } from "../types";
import {
  isMention,
  getIdFromMention,
  mention,
  buildWinnersString,
} from "../util";
import { Command } from "./base";

export class HiScores extends Command {
  commandNames = ["stats", "stat", "scores", "score"];
  help = `View the high scores for the channel, or for a user.\nUsage: \`!(${this.commandNames.join("|")}) <optional_user>\``;
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
