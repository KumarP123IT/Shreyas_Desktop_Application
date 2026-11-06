import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { useToast } from '@/components/ui/Toast';

/**
 * Shared hook for settings tabs.
 * Returns { settings, isLoading, save(keys), saving }.
 * `settings` is the masked public map from GET /api/settings.
 * save() PATCHes only the provided keys; masked secret placeholders are
 * filtered out so secrets are never overwritten by echoing the mask.
 */
export function useSettings() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => settingsApi.get(),
    select: (r) => r.data.data || {},
  });

  const mutation = useMutation({
    mutationFn: (pairs) => settingsApi.update(pairs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to save settings'),
  });

  const save = (pairs) => {
    const clean = {};
    for (const [k, v] of Object.entries(pairs)) {
      if (v === undefined) continue;
      // Never send the masked placeholder back for secrets
      if (typeof v === 'string' && v.includes('••••')) continue;
      clean[k] = v;
    }
    if (Object.keys(clean).length === 0) { toast.info('Nothing to save'); return; }
    mutation.mutate(clean);
  };

  return { settings: data || {}, isLoading, save, saving: mutation.isPending };
}
