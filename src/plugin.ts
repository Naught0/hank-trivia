import { Message } from "@hank.chat/types";
import { Database, Game, GameState } from "./database";
import { TriviaResponse, TriviaResult, getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";
import { decode } from "html-entities";

class TriviaGame {
  private db: Database;
  private channelId: string;
  private activeGame: Game | null = null;
  private gameState: GameState | null = null;
  private apiResponse: TriviaResponse | null = null;

  constructor(db: Database, channelId: string) {
    this.db = db;
    this.channelId = channelId;
  }

  async initialize(): Promise<void> {
    this.activeGame = await this.db.getActiveGame(this.channelId);
    if (this.activeGame?.is_active) {
      this.gameState = await this.db.getGameState(this.activeGame.id);
      this.apiResponse = JSON.parse(this.gameState.api_response);
    }
  }

  async handleMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase();

    if (
      ["stats", "stat", "hiscores"].some((cmd) => content.startsWith(`!${cmd}`))
    ) {
      await this.handleHiScores();
      return;
    }

    if (content.startsWith("!trivia")) {
      return await this.startGame();
    }
    if (!this.activeGame?.is_active) return;

    if (content.startsWith("!strivia")) {
      await this.handleGameOver();
      return;
    }

    await this.handleGuess(message);
  }

  private async startGame(amount: number = 10): Promise<void> {
    if (this.activeGame?.is_active) {
      return this.sendMessage("Game already in progress");
    }

    this.activeGame = await this.db.createGame(this.channelId);
    if (!this.activeGame) {
      return this.sendMessage("Error creating game");
    }

    const response = getQuestions({ amount });
    this.apiResponse = response;
    this.gameState = await this.db.initGameState({
      question_total: amount,
      question_index: 0,
      api_response: JSON.stringify(response),
      game_id: this.activeGame.id,
    });

    this.sendMessage("Starting trivia, use !strivia to stop");
    this.sendQuestion();
  }

  private async handleGuess(message: Message): Promise<void> {
    if (!this.gameState) return;
    if (!this.apiResponse) return;

    const question = this.apiResponse.results[this.gameState.question_index];
    const { answerIndex, choices } = this.getChoices(question);

    const isCorrect = await this.checkAnswer(
      message.content,
      choices[answerIndex],
      question.type,
    );
    if (!isCorrect) return;

    await this.db.createScore(message.authorId, this.activeGame!.id);
    await this.sendCorrectMessage(message.authorId, choices[answerIndex]);

    const nextIdx = this.gameState.question_index + 1;
    if (nextIdx >= this.gameState.question_total) {
      await this.handleGameOver();
    } else {
      this.gameState = await this.db.updateQuestionIndex(
        this.activeGame!.id,
        nextIdx,
      );
      this.sendQuestion();
    }
  }

  private async checkAnswer(
    guess: string,
    correctAnswer: string,
    questionType: string,
  ): Promise<boolean> {
    const { levenshteinEditDistance } = await import(
      "levenshtein-edit-distance"
    );
    if (questionType === "multiple") {
      return guess.toLowerCase() === correctAnswer[2].toLowerCase();
    } else {
      const editDistance = levenshteinEditDistance(guess, correctAnswer, true);
      return editDistance <= 2;
    }
  }

  private getChoices(question: TriviaResult): {
    choices: string[];
    answerIndex: number;
  } {
    const isMultipleChoice = question.type === "multiple";
    if (!isMultipleChoice) {
      return {
        choices: [question.correct_answer, ...question.incorrect_answers],
        answerIndex: 0,
      };
    }

    const alphabet = ["A", "B", "C", "D", "E"];
    const correctAnswer = decode(question.correct_answer);
    const decodedAnswers = [
      ...question.incorrect_answers,
      question.correct_answer,
    ].map((c) => decode(c));
    decodedAnswers.sort();
    const choices = decodedAnswers.map(
      (c, idx) => `**${alphabet[idx]}**. ${c}`,
    );

    return {
      choices,
      answerIndex: decodedAnswers.findIndex((c) => c === correctAnswer),
    };
  }

  private sendQuestion() {
    if (!this.gameState) return;
    if (!this.apiResponse) return;

    const question = this.apiResponse.results[this.gameState.question_index];
    const isMultipleChoice = question.type === "multiple";
    const isTrueOrFalse = question.type === "boolean";
    const { choices } = this.getChoices(question);

    const content = `**Question ${this.gameState.question_index + 1} / ${this.gameState.question_total}**:
${isTrueOrFalse ? "True or False: " : ""}${decode(question.question)}${isMultipleChoice ? `\n**Answers**:\n${choices.join("\n")}` : ""}`;

    this.sendMessage(content);
  }

  private async handleGameOver(): Promise<void> {
    if (!this.activeGame) return;

    await this.db.stopGame(this.activeGame.id);
    const scores = await this.db.getGameScores(this.activeGame.id);
    const winnersMap = scores.reduce(
      (acc, winner) => {
        acc[winner.discord_user_id] = (acc[winner.discord_user_id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const winners = Object.entries(winnersMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const medals = ["🥇", "🥈", "🥉"];
    const content = `Game over! The winners are:\n${winners
      .map((w, idx) => `${medals[idx]} <@${w[0]}> - **${w[1]}** points`)
      .join("\n")}`;

    this.sendMessage(content);
    this.activeGame = null;
    this.gameState = null;
  }

  private async handleHiScores(): Promise<void> {
    const scores = await this.db.getAllTimeScores();
    this.sendMessage(`Hi scores: ${JSON.stringify(scores)}`);
  }

  private sendMessage(content: string) {
    hank.sendMessage(
      Message.create({
        content,
        channelId: this.channelId,
      }),
    );
  }

  private async sendCorrectMessage(
    userId: string,
    answer: string,
  ): Promise<void> {
    this.sendMessage(`Correct <@${userId}>! The answer was: ${answer}`);
  }
}

export async function handleMessage(input: HandleMessageInput) {
  const db = new Database(hank);
  const game = new TriviaGame(db, input.message.channelId);
  await game.initialize();
  await game.handleMessage(input.message);
}
