export function buildSessionWebSocketUrl(locationLike: Pick<Location, "protocol" | "host">): string {
  const protocol = locationLike.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${locationLike.host}/ws/session`;
}
