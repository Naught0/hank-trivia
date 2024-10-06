import { getQuestions } from "../trivia-api";
import type { Context, ICommand } from "../types";
import { createContext, startRound } from "../util";
import { BaseCommand } from "./base";

export class StartTrivia extends BaseCommand implements ICommand {
  commandNames = ["trivia"];
  description = "Start a new trivia game.";
  args = [
    { name: "amount", description: "number of questions", required: false },
  ];

  async execute(ctx: Context): Promise<void> {
    if (ctx.activeGame?.game.is_active)
      return this.hank.react({ message: ctx.message, emoji: "❌" });

    const newGame = await ctx.db.createGame(ctx.message.channelId);
    if (!newGame) return this.hank.react({ message: ctx.message, emoji: "❌" });

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
          ctx.client,
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
