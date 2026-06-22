const ANSI_PATTERN =
  // CSI, OSC, DCS, APC, PM, SOS, and other common terminal control sequences.
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|P[\s\S]*?\u001B\\|_.*?\u001B\\|\^.*?\u001B\\|X.*?\u001B\\|[@-_])/g;

const CARRIAGE_RETURN_PATTERN = /\r(?!\n)/g;
const BACKSPACE_PATTERN = /[^\n]\u0008/g;

export function stripTerminalSequences(input: string): string {
  let output = input.replace(ANSI_PATTERN, "");

  // Remove bare carriage returns while preserving CRLF newlines.
  output = output.replace(CARRIAGE_RETURN_PATTERN, "");

  // Collapse simple backspace-overwrite sequences.
  while (BACKSPACE_PATTERN.test(output)) {
    output = output.replace(BACKSPACE_PATTERN, "");
  }

  return output;
}
