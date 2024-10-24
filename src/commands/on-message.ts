import { levenshteinEditDistance } from "levenshtein-edit-distance";
import { TriviaResult } from "../trivia-api";
import { Context } from "../types";
import { getChoices, mention, nextRound, getMaxEditDistance } from "../util";
import { BaseCommand } from "./base";

export class OnMessage extends BaseCommand {
  commandNames = [];
  default_timeout = 20;

  async execute(ctx: Context): Promise<void> {
    if (!ctx.message.author) return;
    if (!ctx.activeGame?.game.is_active) return;
    if (
      await ctx.db.userAlreadyAnswered(
        ctx.message.author.id,
        ctx.activeGame.game.id,
        ctx.activeGame.gameState.question_index,
      )
    )
      return;

    const { answerIndex, choices } = getChoices(ctx.activeGame.currentQuestion);
    const isCorrect = await this.checkAnswer(
      ctx.message.content,
      choices[answerIndex],
      ctx.activeGame.currentQuestion,
    );
    const score = {
      game_id: ctx.activeGame.game.id,
      discord_user_id: ctx.message.author.id,
      question_index: ctx.activeGame.gameState.question_index,
    };
    if (!isCorrect) {
      await ctx.db.createScore({ ...score, value: 0 });
      return this.hank.react("❌", ctx.message);
    }

    await ctx.db.createScore({
      ...score,
      value: 1,
    });
    ctx.reply(
      `Correct ${mention(ctx.message.author.id)}! The answer was: ${choices[answerIndex]}`,
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
