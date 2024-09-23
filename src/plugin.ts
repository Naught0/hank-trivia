import { Message } from "@hank.chat/types";
import { Database, Game, GameState } from "./database";
import { TriviaResponse, TriviaResult } from "./trivia-api";
import { hank } from "@hank.chat/pdk";
import { Context } from "./types";
import {
  buildQuestionString,
  getChoices,
  getMaxEditDistance,
  mention,
} from "./util";
import { Command, StopTrivia } from "./commands";

export class TriviaGame {
  private activeGame: Game | null = null;
  private gameState: GameState | null = null;
  private apiResponse: TriviaResponse | null = null;
  private currentQuestion: TriviaResult | null = null;
  private channelId: string | null = null;
  private commands: Command[] = [];
  private onMessageHandlers: ((ctx: Context) => Promise<void>)[] = [];
  public prefix = "!";

  constructor(private db: Database) {}

  addCommand(cmd: Command) {
    this.commands.push(cmd);
  }

  private getContext(message: Message): Context {
    return {
      db: this.db,
      message: message,
      args: message.content.split(" ").slice(1),
      reply: (content: string) => this.sendMessage(content),
      activeGame: this.activeGame
        ? {
            game: this.activeGame,
            gameState: this.gameState,
            response: this.apiResponse,
            currentQuestion: this.currentQuestion,
          }
        : null,
    };
  }

  async initialize(channelId: string): Promise<void> {
    this.activeGame = await this.db.getActiveGame(channelId);
    if (this.activeGame?.is_active) {
      this.gameState = await this.db.getGameState(this.activeGame.id);
      this.apiResponse = JSON.parse(
        this.gameState.api_response,
      ) as TriviaResponse;
      this.currentQuestion =
        this.apiResponse.results[this.gameState.question_index];
      this.channelId = channelId;
    }
  }

  async handleMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase();
    let [command, ...args] = content.split(" ");
    command = command.toLowerCase();

    if (this.activeGame?.is_active) {
      this.handleGuess(message);
    }

    for (const cmd of this.commands) {
      if (cmd.commandNames.some((cmd) => `${this.prefix}${cmd}` === command)) {
        return await cmd.execute(this.getContext(message));
      }
    }
  }

  private async handleGuess(message: Message): Promise<void> {
    if (!this.gameState) return;
    if (!this.apiResponse) return;
    if (!this.currentQuestion) return;

    const { answerIndex, choices } = getChoices(this.currentQuestion);

    const isCorrect = await this.checkAnswer(
      message.content,
      choices[answerIndex],
      this.currentQuestion.type,
    );
    if (!isCorrect) return;

    await this.db.createScore(message.authorId, this.activeGame!.id);
    this.sendCorrectMessage(message.authorId, choices[answerIndex]);

    const nextIdx = this.gameState.question_index + 1;
    if (nextIdx >= this.gameState.question_total) {
      const stopTriviaCmd = new StopTrivia(hank, this.db);
      await stopTriviaCmd.execute(this.getContext(message));
    } else {
      this.gameState = await this.db.updateQuestionIndex(
        this.activeGame!.id,
        nextIdx,
      );
      this.sendMessage(buildQuestionString(this.gameState, this.apiResponse));
    }
  }

  private async checkAnswer(
    guess: string,
    correctAnswer: string,
    questionType: string,
  ): Promise<boolean> {
    if (!this.apiResponse || !this.gameState || !this.currentQuestion)
      return false;

    if (questionType === "boolean") {
      return guess.toLowerCase() === correctAnswer.toLowerCase();
    }
    if (questionType === "multiple") {
      const isCorrect = guess.toLowerCase() === correctAnswer[2].toLowerCase();
      if (isCorrect) return isCorrect;

      const minAnswerLength = Math.min(
        ...[
          this.currentQuestion.incorrect_answers,
          this.currentQuestion.correct_answer,
        ].map((a) => a.length),
      );
      const maxDistance = getMaxEditDistance(minAnswerLength);

      const { levenshteinEditDistance } = await import(
        "levenshtein-edit-distance"
      );
      const editDistance = levenshteinEditDistance(
        guess,
        correctAnswer.slice(7),
        true,
      );
      return editDistance <= maxDistance;
    }

    return false;
  }

  private sendMessage(content: string) {
    if (!this.channelId) return;

    hank.sendMessage(
      Message.create({
        content,
        channelId: this.channelId,
      }),
    );
  }

  private sendCorrectMessage(userId: string, answer: string) {
    this.sendMessage(`Correct ${mention(userId)}! The answer was: ${answer}`);
  }
}
