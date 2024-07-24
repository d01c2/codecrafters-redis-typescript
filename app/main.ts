import * as net from "net";

const values = new Map<string, string>();

const parseArgs = () => {
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

const args = parseArgs();
const port = +(args.get("port") ?? 6379);

function parseRESP(input: string): string[] {
  const lines = input.split("\r\n");
  let result: string[] = [];
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
}

const server: net.Server = net.createServer((connection: net.Socket) => {
  console.log("Client Connected");

  connection.on("data", (buffer) => {
    const commands = parseRESP(buffer.toString());

    switch (commands[0].toUpperCase()) {
      case "PING":
        if (commands.length === 1) {
          connection.write("+PONG\r\n");
        } else {
          if (commands.length > 2) {
            connection.write("-ERR wrong number of arguments for command\r\n");
          }
          connection.write(`+${commands[1]}\r\n`);
        }
        break;
      case "ECHO":
        if (commands.length !== 2) {
          connection.write("-ERR wrong number of arguments for command\r\n");
        }
        connection.write(`+${commands[1]}\r\n`);
        break;
      case "SET":
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
        break;
      case "GET":
        if (commands.length !== 2) {
          connection.write("-ERR wrong number of arguments for command\r\n");
        }
        const value = values.get(commands[1]);
        connection.write(
          value ? `\$${value.length}\r\n${value}\r\n` : "$-1\r\n"
        );
        break;
      default:
        connection.write("-ERR unknown command\r\n");
    }
  });

  connection.on("end", () => {
    console.log("Client Disconnected");
  });
});

server.listen(port, "127.0.0.1");
