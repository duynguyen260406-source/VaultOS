import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

const STATUS_OPTS = ['', 'open', 'investigating', 'escalated', 'closed'];
const PRIORITY_OPTS = ['', 'low', 'medium', 'high', 'critical'];
const LINK_TYPES = ['suspicious_activity', 'transaction', 'customer', 'account'];

const STATUS_COLORS = {
  open: { bg: 'rgba(59,130,246,.15)', color: '#3b82f6' },
  investigating: { bg: 'rgba(245,158,11,.15)', color: '#d97706' },
  escalated: { bg: 'rgba(239,68,68,.15)', color: '#ef4444' },
  closed: { bg: 'rgba(100,116,139,.12)', color: '#64748b' },
};
const PRIORITY_COLORS = {
  low: { bg: 'rgba(100,116,139,.1)', color: '#64748b' },
  medium: { bg: 'rgba(59,130,246,.1)', color: '#3b82f6' },
  high: { bg: 'rgba(245,158,11,.12)', color: '#d97706' },
  critical: { bg: 'rgba(239,68,68,.12)', color: '#ef4444' },
};

function Pill({ label, colorMap }) {
  const c = colorMap[label] || { bg: 'rgba(100,116,139,.1)', color: 'var(--muted-foreground)' };
  return html`<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.color};">${label}</span>`;
}

export default function AuditCases() {
  const { user } = useAuth();
  const toast = useToast();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const [detailCase, setDetailCase] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ summary: '', priority: 'medium' });
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const [linkForm, setLinkForm] = useState({ link_type: 'transaction', target_id: '' });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState('');

  const [statusUpdate, setStatusUpdate] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => { load(); }, [statusFilter, priorityFilter]);

  async function load() {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const res = await api.listCases(params);
      setCases(Array.isArray(res) ? res : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function openDetail(caseId) {
    setDetailLoading(true);
    try {
      const c = await api.getCase(caseId);
      setDetailCase(c);
      setStatusUpdate(c.status);
      setClosureReason(c.closure_reason || '');
      setNoteText(''); setLinkError('');
    } catch (e) { toast.error(e.message); }
    finally { setDetailLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.summary.trim()) { setCreateError('Summary is required'); return; }
    setCreateSaving(true); setCreateError('');
    try {
      const c = await api.createCase(createForm);
      toast.success('Case created.');
      setCreateModal(false);
      load();
      openDetail(c.case_id);
    } catch (e) { setCreateError(e.message); }
    finally { setCreateSaving(false); }
  }

  async function handleUpdateStatus() {
    if (!statusUpdate) return;
    setStatusSaving(true);
    try {
      const updated = await api.updateCase(detailCase.case_id, {
        status: statusUpdate,
        closure_reason: statusUpdate === 'closed' ? closureReason : undefined,
      });
      setDetailCase(updated);
      toast.success('Status updated.');
      load();
    } catch (e) { toast.error(e.message); }
    finally { setStatusSaving(false); }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      const updated = await api.addCaseNote(detailCase.case_id, { body: noteText });
      setDetailCase(prev => ({ ...prev, notes: [...(prev.notes || []), updated] }));
      setNoteText('');
    } catch (e) { toast.error(e.message); }
    finally { setNoteSaving(false); }
  }

  async function handleAddLink() {
    if (!linkForm.target_id) { setLinkError('Target ID is required'); return; }
    setLinkSaving(true); setLinkError('');
    try {
      const updated = await api.addCaseLink(detailCase.case_id, {
        link_type: linkForm.link_type,
        target_id: parseInt(linkForm.target_id),
      });
      setDetailCase(prev => ({ ...prev, links: [...(prev.links || []), updated] }));
      setLinkForm(p => ({ ...p, target_id: '' }));
    } catch (e) { setLinkError(e.message); }
    finally { setLinkSaving(false); }
  }

  async function handleRemoveLink(linkId) {
    if (!confirm('Remove this link?')) return;
    try {
      await api.removeCaseLink(detailCase.case_id, linkId);
      setDetailCase(prev => ({ ...prev, links: prev.links.filter(l => l.link_id !== linkId) }));
    } catch (e) { toast.error(e.message); }
  }

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Audit Cases</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;">
          <select className="form-input" style="width:140px;font-size:12px;height:30px;padding:0 8px;"
            value=${statusFilter} onChange=${e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            ${STATUS_OPTS.slice(1).map(s => html`<option key=${s} value=${s}>${s}</option>`)}
          </select>
          <select className="form-input" style="width:130px;font-size:12px;height:30px;padding:0 8px;"
            value=${priorityFilter} onChange=${e => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            ${PRIORITY_OPTS.slice(1).map(p => html`<option key=${p} value=${p}>${p}</option>`)}
          </select>
          <button className="btn btn-primary btn-sm"
            onClick=${() => { setCreateForm({ summary: '', priority: 'medium' }); setCreateError(''); setCreateModal(true); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Case
          </button>
        </div>
      </header>

      <div className="page">
        ${error && html`<div className="alert alert-danger">${error}</div>`}

        <div className="tbl-wrap">
          <div className="tbl-head"><span className="tbl-head-title">Cases (${cases.length})</span></div>
          ${loading ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>`
          : cases.length ? html`
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Summary</th><th>Status</th><th>Priority</th>
                  <th>Links</th><th>Notes</th><th>Opened</th><th>Opened by</th><th></th>
                </tr>
              </thead>
              <tbody>
                ${cases.map(c => html`
                  <tr key=${c.case_id} className="clickable" onClick=${() => openDetail(c.case_id)}>
                    <td style="font-family:monospace;font-size:12px;">#${c.case_id}</td>
                    <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.summary}</td>
                    <td><${Pill} label=${c.status} colorMap=${STATUS_COLORS} /></td>
                    <td><${Pill} label=${c.priority} colorMap=${PRIORITY_COLORS} /></td>
                    <td style="font-size:12px;">${c.link_count}</td>
                    <td style="font-size:12px;">${c.note_count}</td>
                    <td style="font-size:12px;color:var(--body-muted);">${fmt.date(c.opened_at)}</td>
                    <td style="font-size:12px;">${c.opened_by_username || '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick=${e => { e.stopPropagation(); openDetail(c.case_id); }}>Open</button></td>
                  </tr>
                `)}
              </tbody>
            </table>
          ` : html`
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
              <div className="empty-state-title">No cases</div>
              <div className="empty-state-text">No audit cases match the current filters.</div>
            </div>
          `}
        </div>
      </div>

      <!-- Case Detail Modal -->
      <${Modal}
        open=${!!detailCase}
        onClose=${() => setDetailCase(null)}
        title=${detailCase ? 'Case #' + detailCase.case_id : ''}
        large
      >
        ${detailLoading ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>` : detailCase && html`
          <div style="display:flex;flex-direction:column;gap:18px;font-size:13px;">
            <!-- Header info -->
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <${Pill} label=${detailCase.status} colorMap=${STATUS_COLORS} />
              <${Pill} label=${detailCase.priority} colorMap=${PRIORITY_COLORS} />
              <span style="color:var(--muted-foreground);font-size:12px;">Opened ${fmt.datetime(detailCase.opened_at)} by ${detailCase.opened_by_username || 'unknown'}</span>
            </div>

            <p style="margin:0;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:7px;">${detailCase.summary}</p>

            <!-- Status update -->
            ${detailCase.status !== 'closed' && html`
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label className="form-label">Update status</label>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <select className="form-input" style="width:160px;" value=${statusUpdate}
                    onChange=${e => setStatusUpdate(e.target.value)}>
                    ${STATUS_OPTS.slice(1).map(s => html`<option key=${s} value=${s}>${s}</option>`)}
                  </select>
                  ${statusUpdate === 'closed' && html`
                    <input className="form-input" style="flex:1;min-width:180px;" placeholder="Closure reason (optional)"
                      value=${closureReason} onChange=${e => setClosureReason(e.target.value)} />
                  `}
                  <button className="btn btn-secondary btn-sm" onClick=${handleUpdateStatus} disabled=${statusSaving}>
                    ${statusSaving ? html`<${Spinner} />` : 'Update'}
                  </button>
                </div>
              </div>
            `}

            <!-- Links -->
            <div>
              <div style="font-size:12px;font-weight:600;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Links</div>
              ${detailCase.links?.length ? html`
                <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
                  ${detailCase.links.map(l => html`
                    <div key=${l.link_id} style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;">
                      <span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,.1);color:#3b82f6;">${l.link_type}</span>
                      <span style="font-family:monospace;font-size:12px;">#${l.target_id}</span>
                      <span style="color:var(--muted-foreground);font-size:11px;flex:1;">by ${l.added_by_username || 'unknown'}</span>
                      <button className="btn btn-ghost btn-sm" style="color:#ef4444;font-size:11px;"
                        onClick=${() => handleRemoveLink(l.link_id)}>×</button>
                    </div>
                  `)}
                </div>
              ` : html`<p style="margin:0 0 8px;color:var(--muted-foreground);">No links yet.</p>`}
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <select className="form-input" style="width:150px;font-size:12px;" value=${linkForm.link_type}
                  onChange=${e => setLinkForm(p => ({ ...p, link_type: e.target.value }))}>
                  ${LINK_TYPES.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
                </select>
                <input className="form-input" style="width:100px;font-size:12px;" type="number" placeholder="Target ID"
                  value=${linkForm.target_id} onChange=${e => setLinkForm(p => ({ ...p, target_id: e.target.value }))} />
                <button className="btn btn-secondary btn-sm" onClick=${handleAddLink} disabled=${linkSaving}>
                  ${linkSaving ? html`<${Spinner} />` : 'Add Link'}
                </button>
              </div>
              ${linkError && html`<p style="margin:6px 0 0;color:#ef4444;font-size:12px;">${linkError}</p>`}
            </div>

            <!-- Notes timeline -->
            <div>
              <div style="font-size:12px;font-weight:600;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Notes</div>
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
                ${detailCase.notes?.length ? detailCase.notes.map(n => html`
                  <div key=${n.note_id} style="padding:8px 12px;background:var(--card);border:1px solid var(--border);border-radius:7px;">
                    <div style="font-size:11px;color:var(--muted-foreground);margin-bottom:4px;">${fmt.datetime(n.created_at)} · ${n.author_username || 'unknown'}</div>
                    <div style="font-size:13px;white-space:pre-wrap;">${n.body}</div>
                  </div>
                `) : html`<p style="margin:0;color:var(--muted-foreground);">No notes yet.</p>`}
              </div>
              <div style="display:flex;gap:6px;">
                <textarea className="form-input" style="flex:1;min-height:56px;resize:vertical;font-size:12px;"
                  placeholder="Add a note..."
                  value=${noteText} onChange=${e => setNoteText(e.target.value)}></textarea>
                <button className="btn btn-secondary btn-sm" onClick=${handleAddNote} disabled=${noteSaving || !noteText.trim()}
                  style="align-self:flex-end;">
                  ${noteSaving ? html`<${Spinner} />` : 'Add'}
                </button>
              </div>
            </div>
          </div>
        `}
      <//>

      <!-- Create Case Modal -->
      <${Modal}
        open=${createModal}
        onClose=${() => setCreateModal(false)}
        title="New Audit Case"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setCreateModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleCreate} disabled=${createSaving}>
            ${createSaving ? html`<${Spinner} />` : 'Create Case'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          <div className="form-group" style="margin:0;">
            <label className="form-label">Summary <span className="form-req">*</span></label>
            <textarea className="form-input" style="min-height:72px;resize:vertical;" placeholder="Describe the case..."
              value=${createForm.summary} onChange=${e => setCreateForm(p => ({ ...p, summary: e.target.value }))}></textarea>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Priority</label>
            <select className="form-input" value=${createForm.priority}
              onChange=${e => setCreateForm(p => ({ ...p, priority: e.target.value }))}>
              ${PRIORITY_OPTS.slice(1).map(p => html`<option key=${p} value=${p}>${p}</option>`)}
            </select>
          </div>
          ${createError && html`<div className="alert alert-danger">${createError}</div>`}
        </div>
      <//>
    </>
  `;
}
