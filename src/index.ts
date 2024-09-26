import { HandleCommandInput, HandleMessageInput, hank } from "@hank.chat/pdk";
import { Metadata } from "@hank.chat/types";
import {
  HiScores,
  OnMessage,
  SetDefaultQuestionCount,
  SetDefaultTimeout,
  StartTrivia,
  StopTrivia,
  createCommand,
} from "./commands";
import { Database } from "./database";
import { TriviaClient } from "./plugin";

export * from "@hank.chat/pdk";

hank.pluginMetadata = Metadata.create({
  name: "trivia",
  description: "do trivia with your friends that you definitely have",
  version: "0.1.0",
  database: true,
});

hank.registerInstallFunction(install);
hank.registerInitializeFunction(initialize);
hank.registerMessageHandler(handle_message);
hank.registerCommandHandler(handle_command);

const db = new Database(hank);
const trivia = new TriviaClient(db);
const commands = [
  StartTrivia,
  StopTrivia,
  HiScores,
  SetDefaultTimeout,
  SetDefaultQuestionCount,
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
