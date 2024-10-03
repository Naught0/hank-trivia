import { Context } from "../types";
import { buildWinnersString, createHelpText } from "../util";
import { Command } from "./base";

export class StopTrivia extends Command {
  commandNames = ["strivia", "stop"];
  help = createHelpText(this.commandNames, "Stop the current trivia game.");
  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;
    if (!ctx.activeGame) return;

    await ctx.db.stopGame(ctx.activeGame.game.id);
    const scores = await ctx.db.getGameScores(ctx.activeGame.game.id);
    if (!scores.length)
      return this.hank.react({ message: ctx.message, emoji: "✅" });

    const content = `Game over! The winners are:\n${buildWinnersString(scores)}`;
    ctx.reply(content);
  }
}
