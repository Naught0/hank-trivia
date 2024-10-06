import { Context } from "../types";
import {
  isMention,
  getIdFromMention,
  mention,
  buildWinnersString,
} from "../util";
import { BaseCommand } from "./base";

export class HiScores extends BaseCommand {
  commandNames = ["stats", "stat", "scores", "score"];
  description = "View the high scores.";
  args = [{ name: "user", description: "", required: false }];

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
