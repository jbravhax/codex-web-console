import type { SessionRuntimeStatus, SessionStatus } from "./app-types";

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function parseContext(text: string): SessionRuntimeStatus["context"] | null {
  const exactMatch = text.match(/context:\s*(\d+)%\s*\(([\d,]+)\s*\/\s*([\d,]+)\s*tokens?\)/i);
  if (exactMatch) {
    return {
      available: true,
      percent: Number.parseInt(exactMatch[1], 10),
      usedTokens: Number.parseInt(exactMatch[2].replace(/,/g, ""), 10),
      maxTokens: Number.parseInt(exactMatch[3].replace(/,/g, ""), 10),
      display: `${exactMatch[1]}% (${exactMatch[2]}/${exactMatch[3]})`
    };
  }

  const tokenOnlyMatch = text.match(/context:\s*([\d,]+)\s*tokens?/i);
  if (tokenOnlyMatch) {
    return {
      available: true,
      usedTokens: Number.parseInt(tokenOnlyMatch[1].replace(/,/g, ""), 10),
      display: `${tokenOnlyMatch[1]} tokens`
    };
  }

  return null;
}

function parseLimitDisplay(text: string, label: "5h" | "weekly"): { percent?: number; display: string } | null {
  const exactPercent = text.match(new RegExp(`${label}\\s+limit:\\s*(\\d+)%`, "i"));
  if (exactPercent) {
    return {
      percent: Number.parseInt(exactPercent[1], 10),
      display: `${exactPercent[1]}%`
    };
  }

  const remainingPercent = text.match(
    label === "weekly"
      ? /less than\s+(\d+)%\s+of your weekly limit left/i
      : /less than\s+(\d+)%\s+of your 5h limit left/i
  );
  if (remainingPercent) {
    return {
      display: `<${remainingPercent[1]}% left`
    };
  }

  return null;
}

export function createEmptySessionRuntimeStatus(): SessionRuntimeStatus {
  return {
    sessionId: null,
    model: null,
    context: {
      available: false,
      display: "Unavailable"
    },
    limits: {
      available: false,
      fiveHourDisplay: "Unavailable",
      weeklyDisplay: "Unavailable"
    },
    updatedAt: null
  };
}

export function summarizeSessionId(sessionId: string | null): string {
  if (!sessionId) {
    return "-";
  }

  if (UUID_PATTERN.test(sessionId)) {
    return sessionId.slice(0, 8);
  }

  const compact = sessionId.replace(/^session-/, "");
  return compact.length > 12 ? compact.slice(-12) : compact;
}

export function deriveSessionRuntimeStatus(
  previous: SessionRuntimeStatus,
  sessionStatus: SessionStatus,
  terminalText: string
): SessionRuntimeStatus {
  if (!sessionStatus.active) {
    return createEmptySessionRuntimeStatus();
  }

  const nextModel =
    matchFirst(terminalText, [
      /\bmodel:\s+([^\s]+)/i,
      /\bmodel:\s*\r?\n\s*([^\r\n]+)/i,
      /\bModel:\s*\r?\n\s*([^\r\n]+)/i
    ]) ?? previous.model;

  const parsedSessionId =
    matchFirst(terminalText, [/\bSession:\s*\r?\n\s*([0-9a-f-]{36})/i, /\bsession id:\s*([0-9a-f-]{36})/i]) ??
    null;
  const sessionId =
    parsedSessionId ||
    sessionStatus.nativeSessionId ||
    (isUuid(previous.sessionId) ? previous.sessionId : null);
  const parsedContext = parseContext(terminalText) ?? previous.context;
  const parsedFiveHour = parseLimitDisplay(terminalText, "5h");
  const parsedWeekly = parseLimitDisplay(terminalText, "weekly");

  return {
    sessionId,
    model: nextModel,
    context: parsedContext.available ? parsedContext : createEmptySessionRuntimeStatus().context,
    limits: {
      available: Boolean(parsedFiveHour || parsedWeekly || previous.limits.available),
      fiveHourPercent: parsedFiveHour?.percent ?? previous.limits.fiveHourPercent,
      weeklyPercent: parsedWeekly?.percent ?? previous.limits.weeklyPercent,
      fiveHourDisplay: parsedFiveHour?.display ?? previous.limits.fiveHourDisplay,
      weeklyDisplay: parsedWeekly?.display ?? previous.limits.weeklyDisplay
    },
    updatedAt: new Date().toISOString()
  };
}
