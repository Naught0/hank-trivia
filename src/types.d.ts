import type { hank } from "@hank.chat/pdk";
import type { Argument, Message } from "@hank.chat/types";
import { TriviaClient } from "./client";
import { Command } from "./commands";
import type { Config, Database, Game, GameState, TriviaConfigKey } from "./database";
import { TriviaResult } from "./trivia-api";

export type HankPDK = typeof hank;

export interface CommandConstructor {
  new(hank: HankPDK, db: Database): Command
}

export interface ICommand {
  public commandNames: string[];
  public description?: string;
  public args?: Argument[];
  execute(ctx: Context): Promise<void>;
}


export interface Context {
  config: HankConfig;
  client: TriviaClient;
  db: Database;
  message: Message;
  reply(content: string): void;
  activeGame: {
    game: Game;
    gameState: GameState;
    response: TriviaResponse;
    currentQuestion: TriviaResult;
  } | null;
}

export interface TriviaCommandContext extends Context {
  command: string;
  args: string[];
}

export type HankConfig = Record<TriviaConfigKey, string>;
