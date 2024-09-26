import { levenshteinEditDistance } from "levenshtein-edit-distance";
import { TriviaResult } from "../trivia-api";
import { Context } from "../types";
import { getChoices, mention, nextRound, getMaxEditDistance } from "../util";
import { Command } from "./base";

export class OnMessage extends Command {
  commandNames = [];
  default_timeout = 20;

  async execute(ctx: Context): Promise<void> {
    if (!ctx.activeGame?.game.is_active) return;

    const { answerIndex, choices } = getChoices(ctx.activeGame.currentQuestion);
    const isCorrect = await this.checkAnswer(
      ctx.message.content,
      choices[answerIndex],
      ctx.activeGame.currentQuestion,
    );
    if (!isCorrect) return;

    await ctx.db.createScore(ctx.message.authorId, ctx.activeGame.game.id);
    ctx.reply(
      `Correct ${mention(ctx.message.authorId)}! The answer was: ${choices[answerIndex]}`,
    );
    await nextRound(this.hank, ctx);
  }

  private async checkAnswer(
    guess: string,
    correctAnswer: string,
    question: TriviaResult,
  ): Promise<boolean> {
    const questionType = question.type;
    if (questionType === "boolean") {
      return guess.toLowerCase() === correctAnswer.toLowerCase();
    }
    if (questionType === "multiple") {
      const isCorrect = guess.toLowerCase() === correctAnswer[2].toLowerCase();
      if (isCorrect) return isCorrect;

      const minAnswerLength = Math.min(
        ...[question.incorrect_answers, question.correct_answer].map(
          (a) => a.length,
        ),
      );
      const maxDistance = getMaxEditDistance(minAnswerLength);

      const editDistance = levenshteinEditDistance(
        guess,
        correctAnswer.slice(7),
        true,
      );
      return editDistance <= maxDistance;
    }

    return false;
  }
}
