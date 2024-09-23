import { Metadata } from "@hank.chat/types";
import { hank, HandleCommandInput, HandleMessageInput } from "@hank.chat/pdk";
import { Database } from "./database";
import { TriviaGame } from "./plugin";
import { HiScores, StartTrivia, StopTrivia, createCommand } from "./commands";

export * from "@hank.chat/pdk";

hank.pluginMetadata = Metadata.create({
  name: "hank-trivia",
  description: "do trivia with your friends that you definitely have",
  version: "0.1.0",
  database: true,
});

hank.registerInstallFunction(install);
hank.registerInitializeFunction(initialize);
hank.registerMessageHandler(handle_message);
hank.registerCommandHandler(handle_command);

const db = new Database(hank);
const game = new TriviaGame(db);
const commands = [StartTrivia, StopTrivia, HiScores];
for (const cmd of commands) {
  game.addCommand(createCommand(cmd, hank, db));
}

function install() {
  db.createTables();
}

function initialize() {}

async function handle_message(input: HandleMessageInput) {
  await game.initialize(input.message.channelId);
  await game.handleMessage(input.message);
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
