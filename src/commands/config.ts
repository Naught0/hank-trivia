import { Context } from "../types";
import { createHelpText } from "../util";
import { validTimeout } from "../validate";
import { Command } from "./base";

export class SetDefaultTimeout extends Command {
  commandNames = ["timeout", "roundlen"];
  help = createHelpText(this.commandNames, "Set the default round length.", [
    "seconds",
  ]);

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }
    const timeout = parseInt(ctx.args[0]);
    if (!validTimeout(timeout)) {
      return ctx.reply("Timeout must be between 10 and 60 seconds");
    }

    await ctx.db.setRoundTimeout(ctx.message.channelId, timeout);
    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}

export class SetDefaultQuestionCount extends Command {
  commandNames = ["count", "total"];
  help = createHelpText(
    this.commandNames,
    "Set the default number of questions.",
    ["number"],
  );

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length < 1) {
      return ctx.reply(this.help);
    }

    const count = parseInt(ctx.args[0]);
    if (isNaN(count)) {
      return ctx.reply("Number of questions must be a number");
    }

    if (count < 1 || count > 20) {
      return ctx.reply("Number of questions must be between 1 and 20");
    }

    try {
      await ctx.db.setDefaultQuestionCount(ctx.message.channelId, count);
    } catch (error) {
      return ctx.reply((error as Error).message);
    }

    this.hank.react({ message: ctx.message, emoji: "✅" });
  }
}
