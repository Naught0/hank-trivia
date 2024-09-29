import {
  HandleCommandInput,
  HandleMessageInput,
  PluginMetadata,
  hank,
} from "@hank.chat/pdk";
import { createCommand } from "./commands/base";
import { SetDefaultQuestionCount, SetDefaultTimeout } from "./commands/config";
import { HiScores } from "./commands/hiscores";
import { OnMessage } from "./commands/on-message";
import { StartTrivia } from "./commands/start";
import { StopTrivia } from "./commands/stop";
import { Database } from "./database";
import { TriviaClient } from "./client";
import { Help } from "./commands/help";

export * from "@hank.chat/pdk";

export function plugin() {
  hank.pluginMetadata = PluginMetadata.create({
    name: "trivia",
    description: "do trivia with your friends that you definitely have",
    version: "0.1.0",
    database: true,
  });
  hank.registerInstallFunction(install);
  hank.registerInitializeFunction(initialize);
  hank.registerMessageHandler(handle_message);
  hank.registerCommandHandler(handle_command);
}
const db = new Database(hank);
const trivia = new TriviaClient(db);
const commands = [
  StartTrivia,
  StopTrivia,
  HiScores,
  SetDefaultTimeout,
  SetDefaultQuestionCount,
  Help,
];
for (const cmd of commands) {
  trivia.addCommand(createCommand(cmd, hank, db));
}

const messageHandlers = [OnMessage];
for (const handler of messageHandlers) {
  trivia.addMessageHandler(createCommand(handler, hank, db));
}

async function install() {
  await db.createTables();
}

function initialize() {
  console.log("Initializing trivia");
}

async function handle_message(input: HandleMessageInput) {
  await trivia.handleMessage(input.message);
}

async function handle_command(input: HandleCommandInput) {
  // const { message } = input;
  //
  // if (message.content == "!trivia") {
  //   message.content = "Pong!";
  //   hank.sendMessage(message);
  // }
  //
  // let people = await hank.dbQuery(
  //   PreparedStatement.create({ sql: "SELECT * from people" }),
  // );
  // console.log(JSON.stringify(people));
}
