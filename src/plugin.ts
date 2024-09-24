import { Message } from "@hank.chat/types";
import { Database, Game, GameState } from "./database";
import { TriviaResponse, TriviaResult } from "./trivia-api";
import { hank } from "@hank.chat/pdk";
import { Context } from "./types";
import { Command } from "./commands";

export class TriviaClient {
  private activeGame: Game | null = null;
  private gameState: GameState | null = null;
  private apiResponse: TriviaResponse | null = null;
  private currentQuestion: TriviaResult | null = null;
  private channelId: string | null = null;
  private commands: Command[] = [];
  private onMessageHandlers: Command[] = [];
  public prefix = "!";

  constructor(private db: Database) {}

  addCommand(cmd: Command) {
    this.commands.push(cmd);
  }
  addMessageHandler(handler: Command) {
    this.onMessageHandlers.push(handler);
  }

  private createContext(message: Message): Context {
    const [command, ...args] = message.content.split(" ");
    return {
      db: this.db,
      message,
      command,
      args,
      reply: (content: string) =>
        hank.sendMessage(
          Message.create({ content, channelId: this.channelId! }),
        ),
      activeGame: this.activeGame
        ? {
            game: this.activeGame,
            gameState: this.gameState!,
            response: this.apiResponse!,
            currentQuestion: this.currentQuestion!,
          }
        : null,
    };
  }

  async initialize(channelId: string): Promise<void> {
    this.channelId = channelId;
    this.activeGame = await this.db.getActiveGame(this.channelId);
    if (this.activeGame?.is_active) {
      this.gameState = await this.db.getGameState(this.activeGame.id);
      this.apiResponse = JSON.parse(
        this.gameState.api_response,
      ) as TriviaResponse;
      this.currentQuestion =
        this.apiResponse.results[this.gameState.question_index];
    }
  }

  async handleMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase();
    const command = content.split(" ")[0].toLowerCase();
    const context = this.createContext(message);

    for (const cmd of this.commands) {
      if (cmd.commandNames.some((cmd) => `${this.prefix}${cmd}` === command)) {
        return await cmd.execute(context);
      }
    }

    for (const handler of this.onMessageHandlers) {
      await handler.execute(context);
    }
  }
}
