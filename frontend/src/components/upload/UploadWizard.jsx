/**
 * Upload Wizard – 3 steps: Upload → Review → Activate
 * Redesigned for clarity and delight.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight,
  ArrowLeft, X, CloudUpload, Info, Sparkles, Calendar,
  Package, TrendingDown, Bell,
} from 'lucide-react';
import clsx from 'clsx';

import { forecastsApi } from '@/api/forecasts';
import { customersApi } from '@/api/customers';
import { useToast } from '@/components/ui/Toast';
import SkeletonTable from '@/components/ui/SkeletonTable';

const STEPS = [
  { label: 'Upload File',   desc: 'Choose customer & file' },
  { label: 'Review Data',   desc: 'Verify parsed rows' },
  { label: 'Set Schedule',  desc: 'Dates & activation' },
];

export default function UploadWizard({ onClose, preselectedCustomerId }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [customerId, setCustomerId] = useState(preselectedCustomerId ? String(preselectedCustomerId) : '');
  const [uploadResult, setUploadResult] = useState(null);
  const [editedRows, setEditedRows] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData) => forecastsApi.upload(formData),
    onSuccess: (res) => {
      setUploadResult(res.data.data);
      setEditedRows(res.data.data.rows || []);
      setStep(1);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Upload failed'),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => forecastsApi.save(data),
    onSuccess: (res) => {
      setUploadResult((prev) => ({ ...prev, forecast: res.data.data.forecast }));
      setStep(2);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Save failed'),
  });

  const activateMutation = useMutation({
    mutationFn: ({ id, data }) => forecastsApi.activate(id, data),
    onSuccess: (res) => {
      toast.success('Delivery activated successfully!');
      navigate(`/deliveries/${res.data.data.id}`);
      onClose?.();
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Activation failed'),
  });

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = () => {
    if (!file || !customerId) return toast.error('Select a customer and file first');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('customerId', customerId);
    uploadMutation.mutate(fd);
  };

  const handleSave = () => {
    if (!uploadResult) return;
    saveMutation.mutate({
      customerId,
      tempFileToken: uploadResult.tempFileToken,
      fileName: uploadResult.fileName || file?.name,
      fileType: uploadResult.fileType,
      rows: editedRows,
      meta: uploadResult.meta,
      confidence: uploadResult.confidence,
      warnings: uploadResult.warnings || [],
      needsReview: uploadResult.needsReview || [],
    });
  };

  const handleActivate = () => {
    if (!uploadResult?.forecast?.id) return;
    if (dueDate && startDate && new Date(dueDate) < new Date(startDate)) {
      return toast.error('Due date must be on or after start date');
    }
    activateMutation.mutate({
      id: uploadResult.forecast.id,
      data: { rows: editedRows, startDate: startDate || null, dueDate: dueDate || null },
    });
  };

  const confidence = uploadResult?.confidence ?? 0;
  const confidencePct = Math.round(confidence * 100);

  return (
    <div className="space-y-5">

      {/* ── Step indicator ──────────────────────────────────────── */}
      <div className="relative flex items-start">
        {/* connecting line */}
        <div className="absolute top-4 left-4 right-4 h-px bg-border" style={{ left: '2rem', right: '2rem' }} />

        {STEPS.map((s, i) => (
          <div key={s.label} className="flex-1 flex flex-col items-center relative z-10">
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
              i < step
                ? 'bg-success border-success text-white'
                : i === step
                ? 'bg-primary border-primary text-white shadow-md scale-110'
                : 'bg-surface border-border text-text-secondary'
            )}>
              {i < step ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <div className="mt-1.5 text-center hidden sm:block">
              <p className={clsx('text-xs font-semibold', i === step ? 'text-primary' : 'text-text-secondary')}>{s.label}</p>
              <p className="text-[10px] text-text-secondary">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Step 0: Upload ──────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-control border border-blue-100 flex items-start gap-2">
            <Info size={15} className="text-info shrink-0 mt-0.5" />
            <p className="text-xs text-info">
              Upload a <strong>PDF or Excel</strong> forecast file. The system automatically parses part numbers,
              quantities, and forecast month — you review before anything is saved.
            </p>
          </div>

          <div>
            <label className="fiori-label" htmlFor="wiz-customer">Customer *</label>
            <select
              id="wiz-customer"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="fiori-input"
            >
              <option value="">— Select a customer —</option>
              {(customers || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.supplierCode})</option>
              ))}
            </select>
          </div>

          <div
            className={clsx(
              'relative border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition-all',
              dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/60 hover:bg-background/50',
              file ? 'border-success bg-green-50' : ''
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload forecast file"
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                  <FileText size={24} className="text-success" />
                </div>
                <p className="font-semibold text-text">{file.name}</p>
                <p className="text-xs text-text-secondary">{(file.size / 1024).toFixed(0)} KB · {file.name.split('.').pop().toUpperCase()}</p>
                <button
                  className="text-xs text-error underline hover:no-underline mt-1"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-border/30 rounded-full flex items-center justify-center mb-1">
                  <CloudUpload size={28} className="text-text-secondary" />
                </div>
                <p className="text-sm font-semibold text-text">Drop your forecast file here</p>
                <p className="text-xs text-text-secondary">or click to browse your files</p>
                <div className="flex items-center gap-2 mt-2">
                  {['PDF', 'XLSX', 'XLS'].map((ext) => (
                    <span key={ext} className="px-2 py-0.5 bg-background border border-border rounded text-xs font-mono text-text-secondary">.{ext.toLowerCase()}</span>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-1">Max 50 MB</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              className="fiori-btn-primary flex items-center gap-2 min-w-[140px] justify-center"
              onClick={handleUpload}
              disabled={!file || !customerId || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Parsing file…
                </>
              ) : (
                <>Next: Review <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Review ──────────────────────────────────────── */}
      {step === 1 && uploadResult && (
        <div className="space-y-4">
          {/* Parsed meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Customer',       uploadResult.meta?.customerName || '—'],
              ['Supplier Code',  uploadResult.meta?.supplierCode || '—'],
              ['Forecast Month', uploadResult.meta?.forecastMonth || '—'],
              ['Sent Date',      uploadResult.meta?.sentDate ? new Date(uploadResult.meta.sentDate).toLocaleDateString('en-IN') : '—'],
            ].map(([label, val]) => (
              <div key={label} className="bg-background rounded-control p-2.5 border border-border">
                <p className="fiori-label">{label}</p>
                <p className="text-sm font-semibold text-text">{val}</p>
              </div>
            ))}
          </div>

          {/* Confidence bar */}
          <div className={clsx(
            'p-3 rounded-control border-l-4',
            confidencePct >= 90 ? 'bg-green-50 border-success' :
            confidencePct >= 70 ? 'bg-blue-50 border-info' : 'bg-orange-50 border-warning'
          )}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                <Sparkles size={13} className={confidencePct >= 90 ? 'text-success' : confidencePct >= 70 ? 'text-info' : 'text-warning'} />
                Parser Confidence
              </span>
              <span className={clsx(
                'text-sm font-bold',
                confidencePct >= 90 ? 'text-success' : confidencePct >= 70 ? 'text-info' : 'text-warning'
              )}>{confidencePct}%</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  confidencePct >= 90 ? 'bg-success' : confidencePct >= 70 ? 'bg-info' : 'bg-warning'
                )}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <p className="text-xs text-text-secondary mt-1.5">{editedRows.length} rows parsed{uploadResult.isOcr ? ' · OCR was used' : ''}</p>
          </div>

          {/* Warnings */}
          {(uploadResult.warnings?.length > 0 || uploadResult.needsReview?.length > 0) && (
            <div className="message-strip-warning">
              <p className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} />
                {(uploadResult.warnings?.length || 0) + (uploadResult.needsReview?.length || 0)} warnings — please review
              </p>
              {uploadResult.warnings?.slice(0, 4).map((w, i) => (
                <p key={i} className="text-xs mt-0.5">• {w.partNumber && `[${w.partNumber}] `}{w.reason}</p>
              ))}
              {uploadResult.needsReview?.slice(0, 3).map((w, i) => (
                <p key={`nr-${i}`} className="text-xs mt-0.5">• Row {w.lineNo}: {w.reason}</p>
              ))}
            </div>
          )}

          {/* Editable table */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="fiori-label">Parts ({editedRows.length})</span>
              <span className="text-xs text-text-secondary">Click any cell to edit</span>
            </div>
            <div className="overflow-auto max-h-64 border border-border rounded-control">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-semibold text-text-secondary w-8">#</th>
                    <th className="px-2 py-2 text-left font-semibold text-text-secondary">Part Number</th>
                    <th className="px-2 py-2 text-left font-semibold text-text-secondary">Part Name</th>
                    <th className="px-2 py-2 text-left font-semibold text-text-secondary w-20">Total Qty</th>
                    <th className="px-2 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {editedRows.map((row, i) => (
                    <tr key={i} className={clsx(
                      'border-t border-border transition-colors',
                      row.needsReview ? 'bg-orange-50/50' : 'hover:bg-background/50'
                    )}>
                      <td className="px-2 py-1.5 text-text-secondary">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.partNumber}
                          onChange={e => {
                            const r = [...editedRows]; r[i] = { ...r[i], partNumber: e.target.value };
                            setEditedRows(r);
                          }}
                          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none font-mono text-xs py-0.5"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.partName}
                          onChange={e => {
                            const r = [...editedRows]; r[i] = { ...r[i], partName: e.target.value };
                            setEditedRows(r);
                          }}
                          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-xs py-0.5"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={row.totalQty}
                          onChange={e => {
                            const r = [...editedRows]; r[i] = { ...r[i], totalQty: parseInt(e.target.value) || 0 };
                            setEditedRows(r);
                          }}
                          className="w-16 bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-right font-mono text-xs py-0.5"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => setEditedRows(editedRows.filter((_, j) => j !== i))}
                          className="text-error hover:bg-red-50 rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"
                          aria-label="Delete row"
                        >
                          <X size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="mt-1.5 text-xs text-primary hover:underline flex items-center gap-1"
              onClick={() => setEditedRows([...editedRows, { partNumber: '', partName: '', totalQty: 0 }])}
            >
              + Add row
            </button>
          </div>

          <div className="flex justify-between pt-1">
            <button className="fiori-btn-ghost flex items-center gap-1" onClick={() => setStep(0)}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="fiori-btn-primary flex items-center gap-2 min-w-[160px] justify-center"
              onClick={handleSave}
              disabled={saveMutation.isPending || editedRows.length === 0}
            >
              {saveMutation.isPending ? (
                <><span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : (
                <>Save & Configure <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Activate ──────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-control">
            <div className="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Forecast saved — {editedRows.length} parts ready</p>
              <p className="text-xs text-text-secondary mt-0.5">Set delivery dates to activate MSL monitoring and schedule reminders.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="fiori-label" htmlFor="wiz-start">
                <Calendar size={11} className="inline mr-1" /> Start Date
              </label>
              <input
                id="wiz-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="fiori-input"
              />
            </div>
            <div>
              <label className="fiori-label" htmlFor="wiz-due">
                <Calendar size={11} className="inline mr-1" /> Due Date
              </label>
              <input
                id="wiz-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={clsx('fiori-input', dueDate && startDate && new Date(dueDate) < new Date(startDate) ? 'border-error' : '')}
              />
            </div>
          </div>

          {/* What happens on activation */}
          <div className="bg-background border border-border rounded-control p-3 space-y-1.5">
            <p className="text-xs font-semibold text-text uppercase tracking-wide">On activation:</p>
            {[
              { icon: Package, text: `MSL limits snapshotted for all ${editedRows.length} parts` },
              { icon: Bell, text: dueDate ? 'Reminder schedule auto-generated from due date' : 'Set a due date to auto-schedule reminders' },
              { icon: CheckCircle2, text: 'Parts flagged if below MIN or above MAX' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-2 text-xs text-text-secondary">
                <Icon size={12} className="text-info shrink-0 mt-0.5" />
                {text}
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-1">
            <button className="fiori-btn-ghost flex items-center gap-1" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="fiori-btn-primary flex items-center gap-2 min-w-[160px] justify-center"
              onClick={handleActivate}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <><span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Activating…</>
              ) : (
                <><CheckCircle2 size={14} /> Activate Delivery</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
