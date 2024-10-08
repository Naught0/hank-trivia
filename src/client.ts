import { hank } from "@hank.chat/pdk";
import { CommandContext, Message } from "@hank.chat/types";
import { Database } from "./database";
import { ICommand } from "./types";
import { fetchContext } from "./context";

export class TriviaClient {
  commands: ICommand[] = [];
  onMessageHandlers: ICommand[] = [];
  public prefix = "!";

  constructor(public db: Database) {}

  addCommand(cmd: ICommand) {
    this.commands.push(cmd);
  }
  addMessageHandler(handler: ICommand) {
    this.onMessageHandlers.push(handler);
  }

  async handleCommand(hankCtx: CommandContext, message: Message) {
    const cmd = this.commands.find((cmd) =>
      cmd.commandNames.includes(hankCtx.subcommand?.name ?? "start"),
    );
    if (!cmd) return;

    const ctx = await fetchContext(hank, this, message);
    await cmd.execute(ctx);
  }

  async handleMessage(message: Message): Promise<void> {
    const ctx = await fetchContext(hank, this, message);
    for (const handler of this.onMessageHandlers) {
      await handler.execute(ctx);
    }
  }
}
