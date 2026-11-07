import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, KeyRound, User as UserIcon, AlertTriangle } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/Toast';

export default function ProfileSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mustChange = user?.mustChangePassword || searchParams.get('mustChange') === '1';

  const [profile, setProfile] = useState({ displayName: '', email: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => authApi.me(),
    select: (r) => r.data.data,
  });

  useEffect(() => {
    if (me) setProfile({ displayName: me.displayName || '', email: me.email || '' });
  }, [me]);

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile(profile),
    onSuccess: (r) => {
      if (r.data.data) setUser({ ...user, ...r.data.data });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Update failed'),
  });

  const pwMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      // Clear the mustChangePassword flag from the local store, then move on
      setUser({ ...user, mustChangePassword: false });
      if (mustChange) {
        toast.success('Password changed — welcome!');
        navigate('/dashboard', { replace: true });
      }
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Password change failed'),
  });

  const pwValid = pw.newPassword.length >= 8 && /[A-Z]/.test(pw.newPassword) && /[0-9]/.test(pw.newPassword);

  return (
    <div className="space-y-6 max-w-xl">

      {/* Force-change banner */}
      {mustChange && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-control border border-yellow-300 bg-yellow-50 text-yellow-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-yellow-600" />
          <div>
            <p className="text-sm font-semibold">You must change your password before continuing.</p>
            <p className="text-xs mt-0.5 text-yellow-700">
              This is a first-run generated password. Set a new one below and you'll be taken to the dashboard.
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <UserIcon size={16} className="text-primary" /> Profile
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">Signed in as {user?.username}.</p>
      </div>

      {/* Profile fields — hidden while force-change is active */}
      {!mustChange && (
        <div className="space-y-3">
          <div>
            <label className="fiori-label" htmlFor="pf-name">Display name</label>
            <input id="pf-name" className="fiori-input" value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
          </div>
          <div>
            <label className="fiori-label" htmlFor="pf-email">Email</label>
            <input id="pf-email" type="email" className="fiori-input" value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          </div>
          <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>
            <Save size={14} /> {profileMutation.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <KeyRound size={15} className="text-primary" /> {mustChange ? 'Set your new password' : 'Change password'}
        </h3>
        <div>
          <label className="fiori-label" htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type="password" className="fiori-input" value={pw.currentPassword}
            onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" autoFocus={mustChange} />
        </div>
        <div>
          <label className="fiori-label" htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" className="fiori-input" value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
          <p className="text-xs text-text-secondary mt-1">Min 8 characters, one uppercase letter and one number.</p>
        </div>
        <div>
          <label className="fiori-label" htmlFor="pw-conf">Confirm new password</label>
          <input id="pw-conf" type="password" className="fiori-input" value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
          {pw.confirm && pw.confirm !== pw.newPassword && (
            <p className="text-xs text-error mt-1">Passwords do not match</p>
          )}
        </div>
        <button
          className="fiori-btn-primary flex items-center gap-1.5"
          onClick={() => pwMutation.mutate()}
          disabled={pwMutation.isPending || !pw.currentPassword || !pwValid || pw.confirm !== pw.newPassword}
        >
          <KeyRound size={14} /> {pwMutation.isPending ? 'Changing…' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
