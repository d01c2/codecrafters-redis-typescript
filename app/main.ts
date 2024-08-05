import * as net from "net";

type ServerConfig = {
  port: number;
  role: "master" | "slave" | "sentinel";
  master_replid: string;
  master_repl_offset: number;
};
const values = new Map<string, string>();

const randomString = (): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const parseArgs = (): Map<string, string> => {
  const args = process.argv.slice(2);
  const argObj = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      argObj.set(key, value);
      i++;
    }
  }

  return argObj;
};

const args: Map<string, string> = parseArgs();
const cfg: ServerConfig = {
  port: +(args.get("port") ?? 6379),
  role: args.has("replicaof") ? "slave" : "master",
  master_replid: randomString(),
  master_repl_offset: 0,
};

const parseRESP = (input: string): string[] => {
  const lines = input.split("\r\n");
  let result = [];
  let index = 0;

  if (lines[index].startsWith("*")) {
    const arraySize = +lines[index].substring(1);
    index++;

    while (result.length < arraySize && index < lines.length) {
      if (lines[index].startsWith("$")) {
        const strLength = +lines[index].substring(1);
        index++;

        if (lines[index].length === strLength) {
          result.push(lines[index]);
        } else {
          throw new Error("String length does not match the specified length");
        }
        index++;
      } else {
        throw new Error("Invalid RESP format");
      }
    }

    if (result.length !== arraySize) {
      throw new Error("Array size does not match the specified size");
    }
  } else {
    throw new Error("Invalid RESP format");
  }

  return result;
};

const pingHandler = (commands: string[], connection: net.Socket): void => {
  if (commands.length === 1) {
    connection.write("+PONG\r\n");
  } else {
    if (commands.length > 2) {
      connection.write("-ERR wrong number of arguments for command\r\n");
    }
    connection.write(`+${commands[1]}\r\n`);
  }
};

const echoHandler = (commands: string[], connection: net.Socket): void => {
  if (commands.length !== 2) {
    connection.write("-ERR wrong number of arguments for command\r\n");
  }
  connection.write(`+${commands[1]}\r\n`);
};

const setHandler = (commands: string[], connection: net.Socket): void => {
  if (commands.length < 3) {
    connection.write("-ERR wrong number of arguments for command\r\n");
  }
  values.set(commands[1], commands[2]);
  if (!!commands[3] && commands[3].toUpperCase() === "PX") {
    setTimeout(() => {
      values.delete(commands[1]);
    }, +commands[4]);
  }
  connection.write("+OK\r\n");
};

const getHandler = (commands: string[], connection: net.Socket): void => {
  if (commands.length !== 2) {
    connection.write("-ERR wrong number of arguments for command\r\n");
  }
  const value = values.get(commands[1]);
  connection.write(value ? `\$${value.length}\r\n${value}\r\n` : "$-1\r\n");
};

const infoHandler = (commands: string[], connection: net.Socket): void => {
  if (commands.length < 2) {
    connection.write("-ERR wrong number of arguments for command\r\n");
  }
  for (const section of commands.slice(1)) {
    switch (section) {
      case "replication":
        const response = `role:${cfg.role}\r\nmaster_replid:${cfg.master_replid}\r\nmaster_repl_offset:${cfg.master_repl_offset}`;
        const bulkString = `$${response.length}\r\n${response}\r\n`;
        connection.write(bulkString);
        break;
      default:
        connection.write("-ERR unknown section\r\n");
    }
  }
};

const commandHandlers: Map<
  string,
  (commands: string[], connection: net.Socket) => void
> = new Map([
  ["PING", pingHandler],
  ["ECHO", echoHandler],
  ["SET", setHandler],
  ["GET", getHandler],
  ["INFO", infoHandler],
]);

// TODO: Folder Structuring
const server: net.Server = net.createServer((connection: net.Socket) => {
  console.log("Client Connected");

  if (cfg.role == "slave") {
    const socket = new net.Socket();
    const [masterHost, masterPort] = args.get("replicaof")!.split(" ");
    socket.connect(+masterPort, masterHost, () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
  }

  connection.on("data", (buffer) => {
    const commands = parseRESP(buffer.toString());
    const command = commands[0].toUpperCase();

    if (commandHandlers.has(command)) {
      const handler = commandHandlers.get(command)!;
      handler(commands, connection);
    } else {
      connection.write("-ERR unknown command\r\n");
    }
  });

  connection.on("end", () => {
    console.log("Client Disconnected");
  });
});

server.listen(cfg.port, "127.0.0.1");
