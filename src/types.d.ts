import type { hank } from "@hank.chat/pdk";
import type { Database, Game } from "./database";
import type { Message } from "@hank.chat/types";
import { Command } from "./commands";

export type HankPDK = typeof hank;

export interface CommandConstructor {
  new(hank: HankPDK, db: Database): Command
}

export interface ICommand {
  public commandNames: string[];
  execute(ctx: Context, args: string[]): Promise<void>;
}

export interface Context {
  db: Database;
  message: Message;
  args: string[];
  reply(content: string): void;
  activeGame: {
    game: Game;
    gameState: GameState;
    response: TriviaResponse;
    currentQuestion: TriviaResult;
  } | null;
}
