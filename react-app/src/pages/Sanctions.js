import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

const TABS = [
  { id: 'results', label: 'Screening Results' },
  { id: 'entries', label: 'Sanctions List' },
];

const STATUS_COLORS = {
  PendingReview: { bg: 'rgba(245,158,11,.15)', color: '#d97706' },
  FalsePositive: { bg: 'rgba(100,116,139,.12)', color: '#64748b' },
  Confirmed: { bg: 'rgba(239,68,68,.15)', color: '#ef4444' },
  Resolved: { bg: 'rgba(122,223,46,.1)', color: '#7adf2e' },
};

const SOURCE_OPTS = ['OFAC', 'UN', 'EU', 'LOCAL', 'PEP'];
const TYPE_OPTS = ['Individual', 'Entity', 'PEP'];
const REVIEW_OPTS = ['FalsePositive', 'Confirmed', 'Resolved'];

function StatusPill({ s }) {
  const c = STATUS_COLORS[s] || { bg: 'rgba(100,116,139,.1)', color: 'var(--muted-foreground)' };
  return html`<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:${c.bg};color:${c.color};">${s}</span>`;
}

export default function Sanctions() {
  const toast = useToast();
  const [tab, setTab] = useState('results');
  const [results, setResults] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('PendingReview');

  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ list_source: 'LOCAL', entry_type: 'Individual', full_name: '', date_of_birth: '', country: '', identity_number: '', source_notes: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [screenId, setScreenId] = useState('');
  const [screening, setScreening] = useState(false);

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
      toast.success(`Marked as ${status}`);
      loadTab();
    } catch (e) { toast.error(e.message); }
  }

  async function handleScreen() {
    const cid = parseInt(screenId);
    if (!cid) { toast.error('Enter a valid customer ID'); return; }
    setScreening(true);
    try {
      const res = await api.screenCustomer(cid);
      toast.success(`Screening complete: ${res.matches} match(es) found`);
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
        list_source: addForm.list_source,
        entry_type: addForm.entry_type,
        full_name: addForm.full_name,
        date_of_birth: addForm.date_of_birth || null,
        country: addForm.country || null,
        identity_number: addForm.identity_number || null,
        source_notes: addForm.source_notes || null,
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
      toast.success('Entry deactivated');
      loadTab();
    } catch (e) { toast.error(e.message); }
  }

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Sanctions & PEP</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;">
          <input className="form-input" type="number" placeholder="Customer ID" style="width:130px;font-size:12px;height:30px;padding:0 8px;"
            value=${screenId} onChange=${e => setScreenId(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick=${handleScreen} disabled=${screening || !screenId}>
            ${screening ? html`<${Spinner} />` : 'Screen Customer'}
          </button>
          ${tab === 'entries' && html`
            <button className="btn btn-primary btn-sm"
              onClick=${() => { setAddForm({ list_source:'LOCAL', entry_type:'Individual', full_name:'', date_of_birth:'', country:'', identity_number:'', source_notes:'' }); setAddError(''); setAddModal(true); }}>
              + Add Entry
            </button>
          `}
        </div>
      </header>

      <div className="page">
        <div className="tab-bar" style="margin-bottom:16px;">
          ${TABS.map(t => html`
            <button key=${t.id} className=${'tab-btn' + (tab === t.id ? ' active' : '')} onClick=${() => setTab(t.id)}>${t.label}</button>
          `)}
        </div>

        ${tab === 'results' && html`
          <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
            ${['', ...Object.keys(STATUS_COLORS)].map(s => html`
              <button key=${s || 'all'}
                className=${'btn btn-sm ' + (statusFilter === s ? 'btn-primary' : 'btn-secondary')}
                onClick=${() => setStatusFilter(s)}>
                ${s || 'All'}
              </button>
            `)}
          </div>

          <div className="tbl-wrap">
            <div className="tbl-head"><span className="tbl-head-title">Results (${results.length})</span></div>
            ${loading ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>` : results.length ? html`
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Entity</th><th>Matched name</th><th>Score</th>
                    <th>Reason</th><th>Status</th><th>Screened</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${results.map(r => html`
                    <tr key=${r.result_id}>
                      <td style="font-family:monospace;font-size:12px;">#${r.result_id}</td>
                      <td style="font-size:12px;">${r.entity_type} #${r.entity_id}</td>
                      <td style="font-size:12px;font-weight:500;">${r.matched_name || '—'}</td>
                      <td>
                        <span style="font-size:11px;font-weight:700;color:${r.match_score >= 90 ? '#ef4444' : r.match_score >= 70 ? '#d97706' : '#64748b'};">
                          ${r.match_score}%
                        </span>
                      </td>
                      <td style="font-size:11px;color:var(--muted-foreground);">${r.match_reason || '—'}</td>
                      <td><${StatusPill} s=${r.status} /></td>
                      <td style="font-size:12px;color:var(--body-muted);">${fmt.datetime(r.screened_at)}</td>
                      <td>
                        ${r.status === 'Pending Review' && html`
                          <div style="display:flex;gap:4px;flex-wrap:wrap;">
                            ${REVIEW_OPTS.map(s => html`
                              <button key=${s} className="btn btn-ghost btn-sm"
                                style="font-size:10px;padding:2px 6px;color:${s==='Confirmed' ? '#ef4444' : s==='FalsePositive' ? '#64748b' : '#7adf2e'};"
                                onClick=${() => handleReview(r.result_id, s)}>
                                ${s}
                              </button>
                            `)}
                          </div>
                        `}
                        ${r.status !== 'Pending Review' && html`<span style="font-size:11px;color:var(--muted-foreground);">${r.reviewed_by_username || '—'}</span>`}
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            ` : html`
              <div className="empty-state" style="padding:24px 0;">
                <div className="empty-state-title">No results</div>
                <div className="empty-state-text">No screening results match the current filter.</div>
              </div>
            `}
          </div>
        `}

        ${tab === 'entries' && html`
          <div className="tbl-wrap">
            <div className="tbl-head"><span className="tbl-head-title">Sanctions list (${entries.length})</span></div>
            ${loading ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>` : entries.length ? html`
              <table>
                <thead>
                  <tr><th>Source</th><th>Type</th><th>Full name</th><th>DOB</th><th>Country</th><th>Added</th><th></th></tr>
                </thead>
                <tbody>
                  ${entries.map(e => html`
                    <tr key=${e.entry_id}>
                      <td><span style="font-size:11px;padding:2px 6px;border-radius:3px;background:rgba(59,130,246,.1);color:#3b82f6;font-weight:600;">${e.list_source}</span></td>
                      <td style="font-size:12px;color:var(--muted-foreground);">${e.entry_type}</td>
                      <td style="font-size:12px;font-weight:500;">${e.full_name}</td>
                      <td style="font-size:12px;color:var(--body-muted);">${e.date_of_birth ? fmt.date(e.date_of_birth) : '—'}</td>
                      <td style="font-size:12px;color:var(--body-muted);">${e.country || '—'}</td>
                      <td style="font-size:12px;color:var(--body-muted);">${fmt.date(e.added_at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style="color:#ef4444;font-size:11px;"
                          onClick=${() => handleDeactivate(e.entry_id, e.full_name)}>Remove</button>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            ` : html`
              <div className="empty-state" style="padding:24px 0;">
                <div className="empty-state-title">Empty sanctions list</div>
                <div className="empty-state-text">Add entries manually or import from a source.</div>
              </div>
            `}
          </div>
        `}
      </div>

      <${Modal}
        open=${addModal}
        onClose=${() => setAddModal(false)}
        title="Add Sanctions Entry"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setAddModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleAddEntry} disabled=${addSaving}>
            ${addSaving ? html`<${Spinner} />` : 'Add Entry'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
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
            <label className="form-label">Full name <span className="form-req">*</span></label>
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
                onChange=${e => setAddForm(p => ({ ...p, country: e.target.value }))} placeholder="e.g. VN" />
            </div>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Identity number (hashed on save)</label>
            <input className="form-input" value=${addForm.identity_number}
              onChange=${e => setAddForm(p => ({ ...p, identity_number: e.target.value }))}
              placeholder="National ID / passport" />
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Source notes</label>
            <textarea className="form-input" style="min-height:48px;resize:vertical;" value=${addForm.source_notes}
              onChange=${e => setAddForm(p => ({ ...p, source_notes: e.target.value }))}></textarea>
          </div>
          ${addError && html`<div className="alert alert-danger">${addError}</div>`}
        </div>
      <//>
    </>
  `;
}
