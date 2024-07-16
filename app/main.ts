import * as net from "net";

function parseRESP(input: string): string[] {
  const lines = input.split("\r\n");
  let result: string[] = [];
  let index = 0;

  if (lines[index].startsWith("*")) {
    const arraySize = parseInt(lines[index].substring(1), 10);
    index++;

    while (result.length < arraySize && index < lines.length) {
      if (lines[index].startsWith("$")) {
        const strLength = parseInt(lines[index].substring(1), 10);
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

    if (commands[0] === "PING") {
      if (commands.length === 1) {
        connection.write("+PONG\r\n");
      } else {
        connection.write(`+${commands[1]}\r\n`);
      }
    }

    if (commands[0] === "ECHO") {
      connection.write(`+${commands[1]}\r\n`);
    }
  });

  connection.on("end", () => {
    console.log("Client Disconnected");
  });
});

server.listen(6379, "127.0.0.1");
