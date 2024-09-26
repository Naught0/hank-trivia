import { Context } from "../types";
import { buildWinnersString } from "../util";
import { Command } from "./base";

export class StopTrivia extends Command {
  commandNames = ["strivia", "stop"];
  help = `Stop the current trivia game.\nUsage: (${this.commandNames.join("|")})`;
  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;
    if (!ctx.activeGame) return;

    await ctx.db.stopGame(ctx.activeGame.game.id);
    const scores = await ctx.db.getGameScores(ctx.activeGame.game.id);
    const content = `Game over! The winners are:\n${buildWinnersString(scores)}`;
    ctx.reply(content);
  }
}
