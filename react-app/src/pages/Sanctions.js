import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

const SOURCE_OPTS  = ['OFAC', 'UN', 'EU', 'LOCAL', 'PEP'];
const TYPE_OPTS    = ['Individual', 'Entity', 'PEP'];
const REVIEW_OPTS  = ['FalsePositive', 'Confirmed', 'Resolved'];

const STATUS_META = {
  PendingReview: { label: 'Pending Review', color: '#d97706', bg: 'rgba(217,119,6,.1)',  border: 'rgba(217,119,6,.25)'  },
  FalsePositive: { label: 'False Positive', color: '#64748b', bg: 'rgba(100,116,139,.1)', border: 'rgba(100,116,139,.2)' },
  Confirmed:     { label: 'Confirmed',      color: '#ef4444', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)'  },
  Resolved:      { label: 'Resolved',       color: '#22c55e', bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)'  },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'var(--muted-foreground)', bg: 'transparent', border: 'var(--border)' };
  return html`
    <span style=${{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '.03em',
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>${m.label}</span>
  `;
}

function ScoreBadge({ score }) {
  const color = score >= 90 ? '#ef4444' : score >= 70 ? '#d97706' : '#64748b';
  return html`
    <span style=${{
      display: 'inline-block', minWidth: 36, padding: '2px 6px',
      borderRadius: 4, textAlign: 'center',
      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      color, background: `${color}18`,
    }}>${score}</span>
  `;
}

export default function Sanctions() {
  const toast = useToast();
  const [tab, setTab]                   = useState('results');
  const [results, setResults]           = useState([]);
  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [statusFilter, setStatusFilter] = useState('PendingReview');

  const [addModal, setAddModal]   = useState(false);
  const [addForm, setAddForm]     = useState({ list_source: 'LOCAL', entry_type: 'Individual', full_name: '', date_of_birth: '', country: '', identity_number: '', source_notes: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError]   = useState('');

  const [screenId, setScreenId]     = useState('');
  const [screening, setScreening]   = useState(false);

  useEffect(() => { loadTab(); }, [tab, statusFilter]);

  async function loadTab() {
    setLoading(true);
    try {
      if (tab === 'results') {
        const res = await api.listSanctionResults({ status: statusFilter });
        setResults(Array.isArray(res) ? res : []);
      } else {
        const res = await api.listSanctionEntries({});
        setEntries(Array.isArray(res) ? res : []);
      }
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleReview(resultId, status) {
    try {
      await api.reviewSanctionResult(resultId, { status });
      toast.success(`Marked as ${STATUS_META[status]?.label || status}`);
      loadTab();
    } catch (e) { toast.error(e.message); }
  }

  async function handleScreen() {
    const cid = parseInt(screenId);
    if (!cid) { toast.error('Enter a valid customer ID'); return; }
    setScreening(true);
    try {
      const res = await api.screenCustomer(cid);
      toast.success(`Screening complete — ${res.matches} match(es) found`);
      if (tab === 'results') loadTab();
    } catch (e) { toast.error(e.message); }
    finally { setScreening(false); setScreenId(''); }
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!addForm.full_name.trim()) { setAddError('Full name is required'); return; }
    setAddSaving(true); setAddError('');
    try {
      await api.addSanctionEntry({
        list_source:     addForm.list_source,
        entry_type:      addForm.entry_type,
        full_name:       addForm.full_name,
        date_of_birth:   addForm.date_of_birth   || null,
        country:         addForm.country          || null,
        identity_number: addForm.identity_number  || null,
        source_notes:    addForm.source_notes     || null,
      });
      toast.success('Entry added to sanctions list');
      setAddModal(false);
      loadTab();
    } catch (e) { setAddError(e.message); }
    finally { setAddSaving(false); }
  }

  async function handleDeactivate(entryId, name) {
    if (!confirm(`Remove "${name}" from the sanctions list?`)) return;
    try {
      await api.deactivateSanctionEntry(entryId);
      toast.success('Entry removed');
      loadTab();
    } catch (e) { toast.error(e.message); }
  }

  const TABS = [
    { id: 'results', label: 'Screening Results' },
    { id: 'entries', label: 'Sanctions List' },
  ];

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Sanctions & PEP Screening</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;margin-left:auto;">
          <input className="form-input" type="number" placeholder="Customer ID"
            style="width:130px;font-size:12px;height:30px;padding:0 10px;"
            value=${screenId} onChange=${e => setScreenId(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && handleScreen()} />
          <button className="btn btn-secondary btn-sm"
            onClick=${handleScreen} disabled=${screening || !screenId}
            style="display:flex;align-items:center;gap:5px;">
            ${screening
              ? html`<${Spinner} size=${12} /> Screening…`
              : html`
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Screen Customer
              `}
          </button>
          ${tab === 'entries' && html`
            <button className="btn btn-primary btn-sm"
              onClick=${() => { setAddForm({ list_source:'LOCAL', entry_type:'Individual', full_name:'', date_of_birth:'', country:'', identity_number:'', source_notes:'' }); setAddError(''); setAddModal(true); }}>
              Add Entry
            </button>
          `}
        </div>
      </header>

      <div className="page">
        <!-- Tabs -->
        <div className="tabs" style="margin-bottom:16px;">
          ${TABS.map(t => html`
            <div key=${t.id}
              className=${'tab' + (tab === t.id ? ' active' : '')}
              onClick=${() => setTab(t.id)}>
              ${t.label}
            </div>
          `)}
        </div>

        <!-- Screening Results -->
        ${tab === 'results' && html`
          <!-- Status filter bar -->
          <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
            ${[{ id: '', label: 'All' }, ...Object.entries(STATUS_META).map(([id, m]) => ({ id, label: m.label }))].map(({ id, label }) => html`
              <button key=${id || 'all'}
                onClick=${() => setStatusFilter(id)}
                style=${{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  borderColor: statusFilter === id ? 'var(--blue-90)' : 'var(--border)',
                  background: statusFilter === id ? 'rgba(96,165,250,.1)' : 'transparent',
                  color: statusFilter === id ? 'var(--blue-90)' : 'var(--muted-foreground)',
                }}>
                ${label}
              </button>
            `)}
          </div>

          <div className="card" style="padding:0;overflow:hidden;">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:12px;font-weight:600;">
                Screening Results
                <span style="margin-left:6px;font-size:11px;color:var(--muted-foreground);font-weight:400;">${results.length} records</span>
              </span>
            </div>

            ${loading
              ? html`<div style="padding:48px;text-align:center;"><${Spinner} /></div>`
              : results.length === 0
              ? html`<div style="padding:48px;text-align:center;color:var(--muted-foreground);font-size:13px;">No results for this filter.</div>`
              : html`
                <div style="overflow-x:auto;">
                  <table>
                    <thead>
                      <tr>
                        <th style="font-size:10px;width:50px;">#</th>
                        <th style="font-size:10px;">Entity</th>
                        <th style="font-size:10px;">Matched Name</th>
                        <th style="font-size:10px;width:60px;">Score</th>
                        <th style="font-size:10px;">Reason</th>
                        <th style="font-size:10px;">Status</th>
                        <th style="font-size:10px;">Screened</th>
                        <th style="font-size:10px;width:180px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${results.map(r => html`
                        <tr key=${r.result_id}>
                          <td style="font-family:monospace;font-size:11px;color:var(--muted-foreground);">#${r.result_id}</td>
                          <td style="font-size:12px;">${r.entity_type} <span style="font-family:monospace;">#${r.entity_id}</span></td>
                          <td style="font-size:12px;font-weight:500;">${r.matched_name || '—'}</td>
                          <td><${ScoreBadge} score=${r.match_score} /></td>
                          <td style="font-size:11px;color:var(--muted-foreground);font-family:monospace;">${(r.match_reason || '—').replace(/,/g, ', ')}</td>
                          <td><${StatusPill} status=${r.status} /></td>
                          <td style="font-size:11px;color:var(--muted-foreground);">${fmt.date(r.screened_at)}</td>
                          <td>
                            ${r.status === 'PendingReview' && html`
                              <select
                                onChange=${e => e.target.value && handleReview(r.result_id, e.target.value)}
                                style=${{
                                  fontSize: 11, padding: '3px 8px', borderRadius: 5,
                                  border: '1px solid var(--border)', background: 'var(--card)',
                                  color: 'var(--foreground)', cursor: 'pointer',
                                  appearance: 'auto',
                                }}>
                                <option value="">Set outcome…</option>
                                ${REVIEW_OPTS.map(s => html`<option key=${s} value=${s}>${STATUS_META[s]?.label || s}</option>`)}
                              </select>
                            `}
                            ${r.status !== 'PendingReview' && html`
                              <span style="font-size:11px;color:var(--muted-foreground);">${r.reviewed_by_username || '—'}</span>
                            `}
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              `}
          </div>
        `}

        <!-- Sanctions List Entries -->
        ${tab === 'entries' && html`
          <div className="card" style="padding:0;overflow:hidden;">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);">
              <span style="font-size:12px;font-weight:600;">
                Sanctions List
                <span style="margin-left:6px;font-size:11px;color:var(--muted-foreground);font-weight:400;">${entries.length} active entries</span>
              </span>
            </div>

            ${loading
              ? html`<div style="padding:48px;text-align:center;"><${Spinner} /></div>`
              : entries.length === 0
              ? html`<div style="padding:48px;text-align:center;color:var(--muted-foreground);font-size:13px;">No entries. Add entries manually or import from a source.</div>`
              : html`
                <div style="overflow-x:auto;">
                  <table>
                    <thead>
                      <tr>
                        <th style="font-size:10px;">Source</th>
                        <th style="font-size:10px;">Type</th>
                        <th style="font-size:10px;">Full Name</th>
                        <th style="font-size:10px;">Date of Birth</th>
                        <th style="font-size:10px;">Country</th>
                        <th style="font-size:10px;">Added</th>
                        <th style="font-size:10px;width:80px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entries.map(e => html`
                        <tr key=${e.entry_id}>
                          <td>
                            <span style=${{
                              display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                              fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
                              background: 'rgba(59,130,246,.1)', color: '#60a5fa',
                            }}>${e.list_source}</span>
                          </td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${e.entry_type}</td>
                          <td style="font-size:12px;font-weight:500;">${e.full_name}</td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${e.date_of_birth ? fmt.date(e.date_of_birth) : '—'}</td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${e.country || '—'}</td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${fmt.date(e.added_at)}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm"
                              style="font-size:11px;color:#ef4444;"
                              onClick=${() => handleDeactivate(e.entry_id, e.full_name)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              `}
          </div>
        `}
      </div>

      <!-- Add Entry Modal -->
      <${Modal}
        open=${addModal}
        onClose=${() => setAddModal(false)}
        title="Add Sanctions Entry"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setAddModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleAddEntry} disabled=${addSaving}>
            ${addSaving ? html`<${Spinner} size=${12} />` : 'Add Entry'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div className="form-group" style="margin:0;">
              <label className="form-label">List source</label>
              <select className="form-input" value=${addForm.list_source}
                onChange=${e => setAddForm(p => ({ ...p, list_source: e.target.value }))}>
                ${SOURCE_OPTS.map(s => html`<option key=${s} value=${s}>${s}</option>`)}
              </select>
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Entry type</label>
              <select className="form-input" value=${addForm.entry_type}
                onChange=${e => setAddForm(p => ({ ...p, entry_type: e.target.value }))}>
                ${TYPE_OPTS.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
              </select>
            </div>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Full name <span style="color:#ef4444;">*</span></label>
            <input className="form-input" value=${addForm.full_name}
              onChange=${e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
              placeholder="Full legal name" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div className="form-group" style="margin:0;">
              <label className="form-label">Date of birth</label>
              <input type="date" className="form-input" value=${addForm.date_of_birth}
                onChange=${e => setAddForm(p => ({ ...p, date_of_birth: e.target.value }))} />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Country</label>
              <input className="form-input" value=${addForm.country}
                onChange=${e => setAddForm(p => ({ ...p, country: e.target.value }))}
                placeholder="e.g. VN" />
            </div>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Identity number <span style="font-size:10px;color:var(--muted-foreground);">(stored as hash)</span></label>
            <input className="form-input" value=${addForm.identity_number}
              onChange=${e => setAddForm(p => ({ ...p, identity_number: e.target.value }))}
              placeholder="National ID / passport number" />
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Source notes</label>
            <textarea className="form-input" style="min-height:48px;resize:vertical;"
              value=${addForm.source_notes}
              onChange=${e => setAddForm(p => ({ ...p, source_notes: e.target.value }))}></textarea>
          </div>
          ${addError && html`<div className="alert alert-danger" style="font-size:12px;">${addError}</div>`}
        </div>
      <//>
    </>
  `;
}
