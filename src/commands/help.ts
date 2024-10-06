import { codeBlock } from "../markdown";
import { Context } from "../types";
import { BaseCommand } from "./base";

export class Help extends BaseCommand {
  commandNames = ["help", "h"];
  description = "Get help with commands.";
  args = [{ name: "command", description: "command name", required: false }];

  async execute(ctx: Context): Promise<void> {
    if (ctx.args.length) {
      const command = ctx.args[0];
      const cmd = ctx.client.commands.find((cmd) =>
        cmd.commandNames.includes(command),
      );
      if (!cmd) return ctx.reply(`Command \`${command}\` not found`);
      if (!cmd.help) return;

      return ctx.reply(codeBlock(cmd.help));
    }

    const commands = ctx.client.commands
      .filter((c) => c.help)
      .map((cmd) => `${cmd.commandNames[0]} - ${cmd.help}`)
      .join("\n\n");
    return ctx.reply(`\`\`\`Available commands:\n\n${commands}\`\`\``);
  }
}
