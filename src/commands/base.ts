import { Argument } from "@hank.chat/types";
import { Database } from "../database";
import { CommandConstructor, Context, HankPDK, ICommand } from "../types";

export class BaseCommand implements ICommand {
  public commandNames: string[] = [];
  public description = "";
  public args?: Argument[];
  constructor(
    protected hank: HankPDK,
    protected db: Database,
  ) {}

  async execute(_: Context): Promise<void> {}
}

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): BaseCommand {
  return new command(hank, db);
}
