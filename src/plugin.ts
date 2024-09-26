import { Message } from "@hank.chat/types";
import { Database } from "./database";
import { hank } from "@hank.chat/pdk";
import { Command } from "./commands";
import { fetchContext } from "./util";

export class TriviaClient {
  private commands: Command[] = [];
  private onMessageHandlers: Command[] = [];
  public prefix = "!";

  constructor(private db: Database) {}

  addCommand(cmd: Command) {
    this.commands.push(cmd);
  }
  addMessageHandler(handler: Command) {
    this.onMessageHandlers.push(handler);
  }

  async handleMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase();
    const command = content.split(" ")[0].toLowerCase();
    const ctx = await fetchContext(hank, this.db, message);

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
