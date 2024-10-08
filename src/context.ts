import { CommandContext, Message } from "@hank.chat/types";
import { TriviaClient } from "./client";
import { Game, GameState } from "./database";
import { defaultConfig } from "./defaults";
import { TriviaResponse, TriviaResult } from "./trivia-api";
import { Context, HankConfig, HankPDK, TriviaCommandContext } from "./types";

export async function fetchCommandContext(
  hank: HankPDK,
  message: Message,
  client: TriviaClient,
  commandContext: CommandContext,
): Promise<TriviaCommandContext> {
  return (await fetchContext(
    hank,
    client,
    message,
    commandContext,
  )) as TriviaCommandContext;
}

export async function fetchContext(
  hank: HankPDK,
  client: TriviaClient,
  message: Message,
  commandContext?: CommandContext,
): Promise<Context | TriviaCommandContext> {
  const game = await client.db.getActiveGame(message.channelId);

  const config = await client.db.getConfig(message.channelId);
  if (game) {
    const gameState = await client.db.getGameState(game.id);
    const response = JSON.parse(gameState.api_response) as TriviaResponse;
    const currentQuestion = response.results[gameState.question_index];
    return createContext(hank, client, message, config ?? defaultConfig, {
      game,
      gameState,
      response,
      currentQuestion,
      commandContext,
    });
  }

  return createContext(hank, client, message, config ?? defaultConfig, {
    commandContext,
  });
}

export function createContext(
  hank: HankPDK,
  client: TriviaClient,
  message: Message,
  config: HankConfig,
  {
    commandContext,
    game,
    gameState,
    response,
    currentQuestion,
  }: {
    game?: Game;
    gameState?: GameState;
    response?: TriviaResponse;
    currentQuestion?: TriviaResult;
    commandContext?: CommandContext;
  },
): Context | TriviaCommandContext {
  const activeGame = game?.is_active
    ? {
        game,
        gameState: gameState!,
        response: response!,
        currentQuestion: currentQuestion!,
      }
    : null;
  return {
    client,
    db: client.db,
    config,
    command: commandContext?.subcommand?.name,
    args: commandContext?.subcommand?.arguments.map((arg) => arg.value),
    message,
    reply: (content: string) =>
      hank.sendMessage(
        Message.create({ content, channelId: message.channelId }),
      ),
    activeGame,
  };
}
