import { Message } from "@hank.chat/types";
import { Database } from "./database";
import { hank } from "@hank.chat/pdk";
import { fetchContext } from "./util";
import { Command } from "./commands/base";

export class TriviaClient {
  commands: Command[] = [];
  onMessageHandlers: Command[] = [];
  public prefix = "!";

  constructor(public db: Database) {}

  addCommand(cmd: Command) {
    this.commands.push(cmd);
  }
  addMessageHandler(handler: Command) {
    this.onMessageHandlers.push(handler);
  }

  async handleMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase();
    const command = content.split(" ")[0].toLowerCase();
    const ctx = await fetchContext(hank, this, message);

    for (const cmd of this.commands) {
      if (
        cmd.commandNames.some(
          (cmd) => `${this.prefix}${cmd}` === command.toLowerCase(),
        )
      ) {
        return await cmd.execute(ctx);
      }
    }

    for (const handler of this.onMessageHandlers) {
      await handler.execute(ctx);
    }
  }
}
