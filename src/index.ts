import { Metadata } from "@hank.chat/types";
import { hank, HandleCommandInput, HandleMessageInput } from "@hank.chat/pdk";
import { Database } from "./database";
import { handleMessage } from "./plugin";

export * from "@hank.chat/pdk";

hank.pluginMetadata = Metadata.create({
  name: "sample-typescript-plugin",
  description: "A sample plugin to demonstrate some functionality.",
  version: "0.1.0",
  database: true,
});
hank.registerInstallFunction(install);
hank.registerInitializeFunction(initialize);
hank.registerMessageHandler(handle_message);
hank.registerCommandHandler(handle_command);

export const db = new Database(hank);

function install() {
  db.createTables();
}

function initialize() {}

async function handle_message(input: HandleMessageInput) {
  await handleMessage(input);
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
