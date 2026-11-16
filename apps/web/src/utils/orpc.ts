import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import {
  environmentManager,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Queries that render their own error state opt out of the toast.
        if (query.meta?.inlineError) {
          return;
        }
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export const link = new RPCLink({
  fetch: (url, options) =>
    fetch(url, {
      ...options,
      credentials: "include",
    }),
  headers: async () => {
    if (typeof window !== "undefined") {
      return {};
    }

    const { headers } = await import("next/headers");
    return Object.fromEntries(await headers());
  },
  url: `${typeof window === "undefined" ? "http://localhost:3001" : window.location.origin}/api/rpc`,
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
