import { keepPreviousData, useMutation, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import api from "@/api";
import type { SitesParams, SitesResponse } from "./types";

const SITES_KEY = ["sites"] as const;

async function fetchSites(params: SitesParams): Promise<SitesResponse> {
  const { data } = await api.get<SitesResponse>("/sites", { params });
  return data;
}

async function putMarked(domain: string, marked: boolean) {
  const { data } = await api.put<{ domain: string; marked: boolean }>(`/sites/${encodeURIComponent(domain)}`, { marked });
  return data;
}

/** The user's sites for a window and filter. The previous page stays on screen while the next loads. */
type PollInterval = number | false | ((query: Query<SitesResponse>) => number | false | undefined);

export function useSites(params: SitesParams, options: { refetchInterval?: PollInterval } = {}) {
  return useQuery({
    queryKey: [...SITES_KEY, params],
    queryFn: () => fetchSites(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * Marks or unmarks a site. The switch flips immediately and rolls back if the request fails,
 * then every sites list is refetched so filters and totals catch up.
 */
export function useMarkSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, marked }: { domain: string; marked: boolean }) => putMarked(domain, marked),
    onMutate: async ({ domain, marked }) => {
      await queryClient.cancelQueries({ queryKey: SITES_KEY });
      const snapshots = queryClient.getQueriesData<SitesResponse>({ queryKey: SITES_KEY });
      queryClient.setQueriesData<SitesResponse>({ queryKey: SITES_KEY }, (old) =>
        old && { ...old, sites: old.sites.map((site) => (site.domain === domain ? { ...site, marked } : site)) }
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    // The Day view shows marked sites too, so it has to catch up as well.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: SITES_KEY }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["range"] }),
      ]),
  });
}
