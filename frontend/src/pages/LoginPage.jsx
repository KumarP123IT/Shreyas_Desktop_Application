import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, AlertCircle, Lock, Truck, BellRing, BarChart3 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import HexNutLogo from '@/components/ui/HexNutLogo';

// ── Validation schema ─────────────────────────────────────────────────────────
const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Please enter your username or email'),
  password: z.string().min(1, 'Please enter your password'),
  rememberMe: z.boolean().optional().default(false),
});

// ── Feature rows shown on the brand panel ────────────────────────────────────
const features = [
  {
    icon: BarChart3,
    title: 'Real-time MSL Monitoring',
    desc: 'Track every part against min/max limits across all customers.',
  },
  {
    icon: BellRing,
    title: 'Smart Delivery Reminders',
    desc: 'Automated WhatsApp & email alerts, configurable per customer.',
  },
  {
    icon: Truck,
    title: 'Full Delivery Visibility',
    desc: 'Forecast upload, material sheet, delivery schedule — in one place.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Already logged in → redirect
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const loginMutation = useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: (res) => {
      const user = res.data.data.user;
      setUser(user);
      // Force password change before anything else
      if (user.mustChangePassword) {
        navigate('/settings/profile?mustChange=1', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    },
    onError: (err) => {
      const msg = err.response?.data?.error?.message || 'Login failed. Please try again.';
      const code = err.response?.data?.error?.code;
      setServerError(msg);
      setIsLockedOut(code === 'FORBIDDEN' || msg.toLowerCase().includes('locked'));
    },
  });

  const onSubmit = (data) => {
    setServerError('');
    setIsLockedOut(false);
    loginMutation.mutate(data);
  };

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ── Left: Brand panel ───────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[54%] relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A1F44 0%, #0D2D66 50%, #0070F2 100%)' }}
      >
        <HexPattern />

        {/* Full-height inner column */}
        <div className="relative z-10 flex flex-col w-full h-full px-14 py-12">

          {/* TOP: Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <HexNutLogo size={44} />
            <div>
              <p className="text-white/60 text-sm leading-none mb-0.5">Shreyas Industrial Fasteners</p>
              <p className="text-white text-lg font-bold leading-tight">Smart MSL Monitor</p>
            </div>
          </div>

          {/* MIDDLE: Hero + features — centred in remaining space */}
          <div className="flex-1 flex flex-col justify-center gap-10">
            <div className="space-y-4">
              <h1 className="text-[2.6rem] font-bold text-white leading-tight tracking-tight">
                Never miss a delivery.<br />
                Never breach an MSL.
              </h1>
              <p className="text-white/65 text-base leading-relaxed max-w-sm">
                One system to monitor material stock levels, manage customer delivery
                forecasts, and send automated reminders — all running locally on your PC.
              </p>
            </div>

            <div className="space-y-5">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-white/80" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm leading-snug">{title}</p>
                    <p className="text-white/55 text-xs mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BOTTOM: Footer */}
          <p className="shrink-0 text-white/30 text-xs">
            © {new Date().getFullYear()} Shreyas Industrial Fasteners. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right: Login card ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F5F6F7] px-6 py-10 overflow-y-auto">
        {/* Mobile logo (only shown below lg) */}
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <HexNutLogo size={36} />
          <p className="text-lg font-bold text-text">Smart MSL Monitor</p>
        </div>

        {/* Card — fixed width so it doesn't stretch on wide screens */}
        <div className="w-full" style={{ maxWidth: '400px' }}>
          <div className="bg-white rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.10)] border border-[#E8E8E8] px-10 py-10 space-y-6">

            {/* Card header */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold text-[#1D2D3E] tracking-tight">Sign In</h2>
              <p className="text-sm text-[#556B82]">Welcome back. Please enter your credentials.</p>
            </div>

            {/* Error strip */}
            {serverError && (
              <div
                className={isLockedOut ? 'message-strip-error' : 'message-strip-warning'}
                role="alert"
                aria-live="assertive"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm">{serverError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {/* Username / Email */}
              <div className="space-y-1.5">
                <label htmlFor="usernameOrEmail" className="block text-xs font-semibold text-[#556B82] uppercase tracking-wider">
                  Username or Email
                </label>
                <input
                  id="usernameOrEmail"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  {...register('usernameOrEmail')}
                  className={`w-full bg-white border rounded-lg px-4 py-2.5 text-sm text-[#1D2D3E] placeholder-[#9AAABB]
                    focus:outline-none focus:ring-2 focus:ring-[#0070F2] focus:border-[#0070F2] transition-all
                    ${errors.usernameOrEmail ? 'border-[#D20A0A] focus:ring-[#D20A0A]' : 'border-[#D9D9D9]'}`}
                  placeholder="admin or admin@shreyas.local"
                  aria-describedby={errors.usernameOrEmail ? 'user-error' : undefined}
                  aria-invalid={!!errors.usernameOrEmail}
                  disabled={isLockedOut}
                />
                {errors.usernameOrEmail && (
                  <p id="user-error" className="text-xs text-[#D20A0A]" role="alert">
                    {errors.usernameOrEmail.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-[#556B82] uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    {...register('password')}
                    className={`w-full bg-white border rounded-lg px-4 py-2.5 pr-11 text-sm text-[#1D2D3E] placeholder-[#9AAABB]
                      focus:outline-none focus:ring-2 focus:ring-[#0070F2] focus:border-[#0070F2] transition-all
                      ${errors.password ? 'border-[#D20A0A] focus:ring-[#D20A0A]' : 'border-[#D9D9D9]'}`}
                    placeholder="••••••••"
                    aria-describedby={errors.password ? 'pass-error' : undefined}
                    aria-invalid={!!errors.password}
                    disabled={isLockedOut}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AAABB] hover:text-[#556B82] transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p id="pass-error" className="text-xs text-[#D20A0A]" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember me + Forgot */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register('rememberMe')}
                    className="w-4 h-4 accent-[#0070F2] rounded"
                    disabled={isLockedOut}
                  />
                  <span className="text-sm text-[#556B82]">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-sm text-[#0070F2] hover:text-[#0064D9] font-medium transition-colors"
                  onClick={() => alert('Please contact your system administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-[#0070F2] hover:bg-[#0064D9]
                           text-white font-semibold text-sm rounded-lg py-2.5 mt-1
                           transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#0070F2]
                           disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                disabled={isLockedOut || isSubmitting || loginMutation.isPending}
                aria-busy={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <><Spinner /> Signing in…</>
                ) : (
                  <><Lock size={15} aria-hidden="true" /> Sign In</>
                )}
              </button>
            </form>

            {/* Footer note */}
            <p className="text-xs text-[#9AAABB] text-center border-t border-[#F0F0F0] pt-5">
              Supplier Code S0965 · Local instance
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inline components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/**
 * Decorative SVG hex-nut tiling pattern for the brand panel background.
 */
function HexPattern() {
  const hexes = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) {
      const x = col * 90 + (row % 2 === 0 ? 0 : 45);
      const y = row * 78 - 20;
      hexes.push(
        <polygon
          key={`${row}-${col}`}
          points={hexPoints(x + 20, y + 20, 18)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1.5"
        />
      );
    }
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      focusable="false"
    >
      {hexes}
    </svg>
  );
}

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}
