import { getQuestions } from "../trivia-api";
import { Context } from "../types";
import { createContext, createHelpText, startRound } from "../util";
import { Command } from "./base";

export class StartTrivia extends Command {
  commandNames = ["trivia"];
  help = createHelpText(this.commandNames, "Start a new trivia game.", [
    "# of questions (optional)",
  ]);

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
