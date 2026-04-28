import { getConnector, register } from "@news/connectors-core";
import { hnConnector } from "@news/connectors-hn";
import { rssConnector } from "@news/connectors-rss";
import { wechatWeweConnector } from "@news/connectors-wechat-wewe";
import { xRsshubConnector, xRsshubSearchConnector } from "@news/connectors-x-rsshub";
import type { SourceKind } from "@news/db";

let registered = false;

function ensureConnectorsRegistered() {
  if (registered) return;
  register(hnConnector);
  register(rssConnector);
  register(xRsshubConnector);
  register(xRsshubSearchConnector);
  register(wechatWeweConnector);
  registered = true;
}

export async function validateSourceConfig(kind: SourceKind, config: unknown) {
  ensureConnectorsRegistered();
  await getConnector(kind).validateConfig(config);
}
