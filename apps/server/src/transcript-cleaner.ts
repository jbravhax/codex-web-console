export function stripTerminalSequences(input: string): string {
  let output = "";
  let currentLine: string[] = [];
  let cursor = 0;

  const flushLine = (appendNewline: boolean) => {
    output += currentLine.join("");
    if (appendNewline) {
      output += "\n";
    }

    currentLine = [];
    cursor = 0;
  };

  const writeVisibleCharacter = (character: string) => {
    if (cursor < currentLine.length) {
      currentLine[cursor] = character;
    } else {
      currentLine.push(character);
    }

    cursor += 1;
  };

  const clearLine = (mode: 0 | 1 | 2) => {
    if (mode === 2) {
      currentLine = [];
      cursor = 0;
      return;
    }

    if (mode === 1) {
      for (let index = 0; index < cursor; index += 1) {
        currentLine[index] = "";
      }
      return;
    }

    currentLine = currentLine.slice(0, cursor);
  };

  const skipEscapeSequence = (
    startIndex: number
  ): {
    nextIndex: number;
    apply?: () => void;
  } => {
    const nextCharacter = input[startIndex + 1];
    if (!nextCharacter) {
      return { nextIndex: input.length };
    }

    if (nextCharacter === "[") {
      for (let index = startIndex + 2; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          const finalCharacter = input[index];
          const params = input.slice(startIndex + 2, index);
          if (finalCharacter === "K") {
            const mode = params === "" ? 0 : Number.parseInt(params, 10);
            if (mode === 0 || mode === 1 || mode === 2) {
              return {
                nextIndex: index + 1,
                apply: () => clearLine(mode)
              };
            }
          }

          return { nextIndex: index + 1 };
        }
      }

      return { nextIndex: input.length };
    }

    if (nextCharacter === "]") {
      for (let index = startIndex + 2; index < input.length; index += 1) {
        if (input[index] === "\u0007") {
          return { nextIndex: index + 1 };
        }

        if (input[index] === "\u001B" && input[index + 1] === "\\") {
          return { nextIndex: index + 2 };
        }
      }

      return { nextIndex: input.length };
    }

    if (nextCharacter === "P" || nextCharacter === "_" || nextCharacter === "^" || nextCharacter === "X") {
      for (let index = startIndex + 2; index < input.length - 1; index += 1) {
        if (input[index] === "\u001B" && input[index + 1] === "\\") {
          return { nextIndex: index + 2 };
        }
      }

      return { nextIndex: input.length };
    }

    return { nextIndex: startIndex + 2 };
  };

  for (let index = 0; index < input.length; ) {
    const character = input[index];

    if (character === "\u001B") {
      const sequence = skipEscapeSequence(index);
      sequence.apply?.();
      index = sequence.nextIndex;
      continue;
    }

    if (character === "\r") {
      if (input[index + 1] === "\n") {
        flushLine(true);
        index += 2;
        continue;
      }

      cursor = 0;
      index += 1;
      continue;
    }

    if (character === "\n") {
      flushLine(true);
      index += 1;
      continue;
    }

    if (character === "\b") {
      cursor = Math.max(0, cursor - 1);
      index += 1;
      continue;
    }

    if (character < " " && character !== "\t") {
      index += 1;
      continue;
    }

    writeVisibleCharacter(character);
    index += 1;
  }

  if (currentLine.length > 0) {
    output += currentLine.join("");
  }

  return output;
}
