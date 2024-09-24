import type { hank } from "@hank.chat/pdk";
import type { Message } from "@hank.chat/types";
import { Command } from "./commands";
import type { Database, Game, GameState } from "./database";
import { TriviaResult } from "./trivia-api";

export type HankPDK = typeof hank;

export interface CommandConstructor {
  new(hank: HankPDK, db: Database): Command
}

export interface ICommand {
  public commandNames: string[];
  execute(ctx: Context): Promise<void>;
}


export interface Context {
  db: Database;
  message: Message;
  command: string;
  args: string[];
  reply(content: string): void;
  activeGame: {
    game: Game;
    gameState: GameState;
    response: TriviaResponse;
    currentQuestion: TriviaResult;
  } | null;
}
