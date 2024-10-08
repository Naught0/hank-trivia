import { hank } from "@hank.chat/pdk";
import { CommandContext, Message, Metadata } from "@hank.chat/types";
import { TriviaClient } from "./client";
import { createCommand } from "./commands/base";
import { SetDefaultQuestionCount, SetDefaultTimeout } from "./commands/config";
import { HiScores } from "./commands/hiscores";
import { OnMessage } from "./commands/on-message";
import { StartTrivia } from "./commands/start";
import { StopTrivia } from "./commands/stop";
import { Database } from "./database";

export * from "@hank.chat/pdk";

const db = new Database(hank);
const trivia = new TriviaClient(db);
const commands = [
  StartTrivia,
  StopTrivia,
  HiScores,
  SetDefaultTimeout,
  SetDefaultQuestionCount,
].map((c) => createCommand(c, hank, db));

for (const cmd of commands) {
  trivia.addCommand(cmd);
}

const messageHandlers = [OnMessage];
for (const handler of messageHandlers) {
  trivia.addMessageHandler(createCommand(handler, hank, db));
}

export function plugin() {
  hank.pluginMetadata = {
    ...Metadata.create(),
    author: "naught",
    name: "trivia",
    description: "do trivia with your friends that you definitely have",
    version: "0.1.0",
    database: true,
    handlesCommands: true,
    handlesMessages: true,
    allowedHosts: ["*"],
    subcommands: commands.map((c) => ({
      name: c.commandNames[0],
      description: c.description,
      arguments: c.args ?? [],
      subcommands: [],
      aliases: c.commandNames.slice(1),
    })),
  };
  hank.registerInstallFunction(install);
  hank.registerInitializeFunction(initialize);
  hank.registerMessageHandler(handle_message);
  hank.registerChatCommandHandler(handle_chat_command);
}

async function install() {
  await db.createTables();
}

function initialize() {
  console.log("Trivia initializing");
}

async function handle_message(input: Message) {
  await trivia.handleMessage(input);
}

async function handle_chat_command(context: CommandContext, message: Message) {
  await trivia.handleCommand(context, message);
}
