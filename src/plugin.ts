import { Message } from "@hank.chat/types";
import { Database, Game, GameState, UserScore } from "./database";
import { TriviaResponse, TriviaResult, getQuestions } from "./trivia-api";
import { HandleMessageInput, hank } from "@hank.chat/pdk";
import { decode } from "html-entities";

export async function handleMessage(input: HandleMessageInput) {
  const db = new Database(hank);
  const game = new TriviaGame(db, input.message.channelId);
  await game.initCurrentGame();
  await game.handleMessage(input.message);
}

class TriviaGame {
  private db: Database;
  private channelId: string;
  private activeGame: Game | null = null;
  private gameState: GameState | null = null;
  private apiResponse: TriviaResponse | null = null;
  private currentQuestion: TriviaResult | null = null;

  constructor(db: Database, channelId: string) {
    this.db = db;
    this.channelId = channelId;
  }

  async initCurrentGame(): Promise<void> {
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

    if (
      ["stats", "stat", "hiscores"].some((cmd) => content.startsWith(`!${cmd}`))
    ) {
      return await this.handleHiScores();
    }

    if (content.startsWith("!trivia")) {
      return await this.startGame();
    }
    if (!this.activeGame?.is_active) return;

    if (content.startsWith("!strivia")) {
      return await this.handleGameOver();
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
    this.sendCorrectMessage(message.authorId, choices[answerIndex]);

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
    if (!this.apiResponse || !this.gameState || !this.currentQuestion)
      return false;

    if (questionType === "boolean") {
      return guess.toLowerCase() === correctAnswer[0].toLowerCase();
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
    const content = `Game over! The winners are:\n${buildWinnersString(scores)}`;
    this.sendMessage(content);

    this.activeGame = null;
    this.gameState = null;
    this.apiResponse = null;
    this.currentQuestion = null;
  }

  private async handleHiScores(): Promise<void> {
    const scores = await this.db.getAllTimeScores();
    this.sendMessage(
      `**Trivia** - All Time High Scores:\n${buildWinnersString(scores)}`,
    );
  }

  private sendMessage(content: string) {
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

function getMaxEditDistance(minAnswerLength: number) {
  if (minAnswerLength < 6) return 0;
  if (minAnswerLength > 12) return 3;

  return 2;
}

function mention(id: string) {
  return `<@${id}>`;
}

function getMedalByIndex(idx: number) {
  const medals = ["🥇", "🥈", "🥉"];
  return medals?.[idx] ?? "";
}

function buildWinnersString(winners: UserScore[]) {
  return winners
    .map(
      (w, idx) =>
        `${getMedalByIndex(idx)} ${mention(w.discord_user_id)} - **${w.count}** point${
          w.count === 1 ? "" : "s"
        }`,
    )
    .join("\n");
}
