import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Database, Play, Download, RotateCcw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Dialog from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { backupApi } from '@/api/backup';

function fmtSize(bytes) {
  if (bytes == null) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function BackupRestore() {
  const toast = useToast();
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupApi.list(),
    select: (r) => r.data.data || [],
  });
  const backups = data || [];

  const runMutation = useMutation({
    mutationFn: () => backupApi.runNow(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['health'] });
      if (r.data.data?.ok) toast.success(`Backup saved (${fmtSize(r.data.data.sizeBytes)})`);
      else toast.error(`Backup failed: ${r.data.data?.error || 'unknown'}`);
    },
    onError: () => toast.error('Backup request failed'),
  });

  const downloadMutation = useMutation({
    mutationFn: (fileName) => backupApi.download(fileName),
    onSuccess: (r, fileName) => {
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error('Download failed'),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ filePath }) => backupApi.restore(filePath, 'RESTORE'),
    onSuccess: () => {
      toast.success('Database restored from backup');
      setRestoreTarget(null); setConfirmText('');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Restore failed'),
  });

  if (isLoading) return <SkeletonTable rows={4} cols={4} />;

  const fileNameOf = (p) => p.split('/').pop();

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Database size={16} className="text-primary" /> Backup / Restore
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            A full database dump runs automatically every day at 02:00. The last 14 backups are kept.
          </p>
        </div>
        <button className="fiori-btn-primary flex items-center gap-1.5 shrink-0" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <Play size={14} /> {runMutation.isPending ? 'Backing up…' : 'Back up now'}
        </button>
      </div>

      {backups.length === 0 ? (
        <div className="fiori-card p-8 text-center text-sm text-text-secondary">
          No backups yet. Run one now or wait for the daily 02:00 job.
        </div>
      ) : (
        <div className="fiori-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background border-b border-border text-left">
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">File</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Size</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Created</th>
                <th className="px-3 py-2 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-border hover:bg-background/70">
                  <td className="px-3 py-2 font-mono text-xs">{fileNameOf(b.filePath)}</td>
                  <td className="px-3 py-2">{fmtSize(b.sizeBytes)}</td>
                  <td className="px-3 py-2">
                    {b.status === 'success'
                      ? <span className="status-badge status-normal"><CheckCircle2 size={11} /> Success</span>
                      : <span className="status-badge status-below"><XCircle size={11} /> Failed</span>}
                    {b.error && <p className="text-xs text-error mt-0.5 max-w-xs truncate" title={b.error}>{b.error}</p>}
                  </td>
                  <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                    {format(new Date(b.createdAt), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        className="fiori-btn-ghost text-xs flex items-center gap-1"
                        onClick={() => downloadMutation.mutate(fileNameOf(b.filePath))}
                        disabled={b.status !== 'success' || downloadMutation.isPending}
                        aria-label="Download backup"
                      >
                        <Download size={12} />
                      </button>
                      {b.status === 'success' && (
                        <button
                          className="fiori-btn-ghost text-xs text-error flex items-center gap-1"
                          onClick={() => { setRestoreTarget(b); setConfirmText(''); }}
                          aria-label="Restore this backup"
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Restore confirmation */}
      <Dialog
        open={!!restoreTarget}
        onClose={() => { setRestoreTarget(null); setConfirmText(''); }}
        title="Restore Database"
        size="sm"
        footer={
          <>
            <button className="fiori-btn-ghost" onClick={() => setRestoreTarget(null)}>Cancel</button>
            <button
              className="px-4 py-2 rounded-control font-semibold text-white bg-error hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={confirmText !== 'RESTORE' || restoreMutation.isPending}
              onClick={() => restoreMutation.mutate({ filePath: restoreTarget.filePath })}
            >
              {restoreMutation.isPending ? 'Restoring…' : 'Restore Now'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="message-strip-warning flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p className="text-sm">
              This will <strong>overwrite the entire database</strong> with{' '}
              <span className="font-mono">{restoreTarget ? fileNameOf(restoreTarget.filePath) : ''}</span>.
              All changes made after that backup will be lost.
            </p>
          </div>
          <div>
            <label className="fiori-label" htmlFor="restore-confirm">
              Type <span className="font-mono text-error">RESTORE</span> to confirm
            </label>
            <input
              id="restore-confirm"
              className="fiori-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              autoComplete="off"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
