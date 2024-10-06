import { Context } from "../types";
import { validTimeout } from "../validate";
import { BaseCommand } from "./base";

export class SetDefaultTimeout extends BaseCommand {
  commandNames = ["timeout", "roundlen"];
  description = "Set the default round length.";
  args = ["number"];

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }
    const timeout = parseInt(ctx.args[0]);
    if (isNaN(timeout))
      return this.hank.react({ message: ctx.message, emoji: "❌" });

    if (!validTimeout(timeout))
      return ctx.reply("Timeout must be between 10 and 60 seconds");

    await ctx.db.setRoundTimeout(ctx.message.channelId, timeout);
    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}

export class SetDefaultQuestionCount extends BaseCommand {
  commandNames = ["count", "total"];
  args = ["number"];
  description = "Set the default number of questions.";

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }

    const count = parseInt(ctx.args[0]);
    if (isNaN(count))
      return this.hank.react({ message: ctx.message, emoji: "❌" });

    try {
      await ctx.db.setDefaultQuestionCount(ctx.message.channelId, count);
    } catch (error) {
      return ctx.reply((error as Error).message);
    }
    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}
