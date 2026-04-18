import type { Connector, ConnectorKind } from "./types";

const registry = new Map<ConnectorKind, Connector>();

export function register(connector: Connector) {
  registry.set(connector.kind, connector);
}

export function getConnector(kind: ConnectorKind) {
  const connector = registry.get(kind);
  if (!connector) {
    throw new Error(`No connector for kind=${kind}`);
  }
  return connector;
}

export function listRegisteredConnectors() {
  return Array.from(registry.values());
}
