import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { getPageState, setPageState } from '../lib/pageState.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner, LoadingRow, RoleBadge, StatusBadge } from '../components/Spinner.js';

const TABS = [['users','App Users'],['employees','Employees'],['branches','Branches'],['account-types','Account Types'],['rules','Rules & Limits']];
const ADD_LABELS = { users:'Add User', employees:'Add Employee', branches:'Add Branch', 'account-types':'Add Type', rules: null };
const PAGE_STATE_KEY = 'admin';

export default function Admin() {
  const toast = useToast();
  const cachedPageState = getPageState(PAGE_STATE_KEY, { tab: 'users', tabSearch: '', roleFilter: '' });
  const [tab,        setTab]        = useState(cachedPageState.tab);
  const [data,       setData]       = useState({});
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(null);
  const [formError,  setFormError]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState({});
  const [extraData,  setExtraData]  = useState({});
  const [tabSearch,  setTabSearch]  = useState(cachedPageState.tabSearch);
  const [roleFilter, setRoleFilter] = useState(cachedPageState.roleFilter);

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  useEffect(() => {
    setPageState(PAGE_STATE_KEY, { tab, tabSearch, roleFilter });
  }, [tab, tabSearch, roleFilter]);

  async function loadTab(t) {
    setLoading(true);
    try {
      if (t === 'users') {
        const res = await api.listUsers();
        setData(d => ({ ...d, users: res.users || [] }));
      } else if (t === 'employees') {
        const res = await api.listEmployees();
        setData(d => ({ ...d, employees: res.employees || [] }));
      } else if (t === 'branches') {
        const res = await api.listBranches();
        setData(d => ({ ...d, branches: Array.isArray(res) ? res : res.branches || [] }));
      } else if (t === 'account-types') {
        const res = await api.listAccountTypes();
        setData(d => ({ ...d, 'account-types': Array.isArray(res) ? res : res.account_types || [] }));
      } else if (t === 'rules') {
        const res = await api.listRules();
        setData(d => ({ ...d, rules: res.rules || [] }));
      }
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function openModal(type, editItem) {
    setFormError(''); setForm({});
    if (type === 'users') {
      const [emps] = await Promise.allSettled([api.listEmployees()]);
      const empList = emps.status === 'fulfilled' ? (emps.value.employees || []) : [];
      setExtraData({ empList });
      setForm({ username: editItem?.username || '', role: editItem?.role || 'manager', status: editItem?.status || 'active', employee_id: editItem?.employee_id || '', password: '' });
      setModal({ type, editItem, title: editItem ? 'Edit User' : 'New App User' });
    } else if (type === 'employees') {
      const brs = await api.listBranches().catch(() => ({ branches: [] }));
      const branchList = Array.isArray(brs) ? brs : brs.branches || [];
      setExtraData({ branchList });
      setForm({ first_name: editItem?.first_name || '', last_name: editItem?.last_name || '', position: editItem?.position || '', salary: editItem?.salary || '', email: editItem?.email || '', phone: editItem?.phone || '', branch_id: editItem?.branch_id || '', hire_date: editItem?.hire_date || '' });
      setModal({ type, editItem, title: editItem ? 'Edit Employee' : 'New Employee' });
    } else if (type === 'branches') {
      setForm({ branch_name: editItem?.branch_name || '', city: editItem?.city || '', address: editItem?.address || '', phone: editItem?.phone || '', established_date: '' });
      setModal({ type, editItem, title: editItem ? 'Edit Branch' : 'New Branch' });
    } else if (type === 'account-types') {
      setForm({ type_name: '', description: '' });
      setModal({ type, editItem: null, title: 'New Account Type' });
    } else if (type === 'rules') {
      const val = typeof editItem.value === 'object' ? JSON.stringify(editItem.value) : String(editItem.value ?? '');
      setForm({ value: val, description: editItem.description || '', active: editItem.active ? 'true' : 'false' });
      setModal({ type, editItem, title: `Edit rule: ${editItem.code}` });
    }
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSave(e) {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      const { type, editItem } = modal;
      if (type === 'users') {
        const d = { username: form.username.trim(), role: form.role, status: form.status, employee_id: parseInt(form.employee_id) || null };
        if (!d.username || d.username.length < 3) throw new Error('Username must be at least 3 characters.');
        if (!editItem) {
          if (!form.password) throw new Error('Password is required.');
          if (form.password.length < 8) throw new Error('Password must be at least 8 characters.');
          d.password = form.password;
        }
        editItem ? await api.updateUser(editItem.user_id, d) : await api.createUser(d);
        toast.success(editItem ? 'User updated.' : 'User created.');
      } else if (type === 'employees') {
        const d = { first_name: form.first_name.trim(), last_name: form.last_name.trim(), position: form.position || null, salary: parseFloat(form.salary) || null, email: form.email.trim() || null, phone: form.phone.trim() || null, branch_id: parseInt(form.branch_id) || null, hire_date: form.hire_date || null };
        if (!d.first_name || !d.last_name || !d.branch_id) throw new Error('First name, last name and branch are required.');
        if (!editItem) {
          if (!form.position) throw new Error('Position is required.');
          if (!form.salary || isNaN(parseFloat(form.salary))) throw new Error('Salary is required.');
          if (!form.hire_date) throw new Error('Hire date is required.');
        }
        editItem ? await api.updateEmployee(editItem.employee_id, d) : await api.createEmployee(d);
        toast.success(editItem ? 'Employee updated.' : 'Employee created.');
      } else if (type === 'branches') {
        const d = { branch_name: form.branch_name.trim(), city: form.city.trim() || null, address: form.address.trim() || null, phone: form.phone.trim() || null };
        if (!d.branch_name) throw new Error('Branch name is required.');
        if (!editItem) {
          if (!d.city || !d.address || !d.phone) throw new Error('City, address, and phone are required.');
          if (!form.established_date) throw new Error('Established date is required.');
          d.established_date = form.established_date;
        }
        editItem ? await api.updateBranch(editItem.branch_id, d) : await api.createBranch(d);
        toast.success(editItem ? 'Branch updated.' : 'Branch created.');
      } else if (type === 'account-types') {
        if (!form.type_name.trim()) throw new Error('Type name is required.');
        await api.createAccountType({ type_name: form.type_name.trim(), description: form.description.trim() || null });
        toast.success('Account type created.');
      } else if (type === 'rules') {
        let parsed;
        try { parsed = JSON.parse(form.value); } catch { parsed = form.value; }
        await api.updateRule(modal.editItem.code, {
          value: parsed,
          active: form.active === 'true',
          description: form.description.trim() || null,
        });
        toast.success('Rule updated.');
      }
      setModal(null);
      loadTab(tab);
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleUnlock(id) {
    try { await api.unlockUser(id); toast.success('User unlocked.'); loadTab('users'); }
    catch (e) { toast.error(e.message); }
  }

  function openResetPassword(userId) {
    setForm({ new_password: '' }); setFormError('');
    setModal({ type: 'reset-password', userId, title: 'Reset Password' });
  }

  async function handleResetPassword(e) {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      if (!form.new_password || form.new_password.length < 8) throw new Error('Password must be at least 8 characters.');
      await api.resetPwd(modal.userId, { new_password: form.new_password });
      toast.success('Password reset.');
      setModal(null);
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  const allRows = data[tab] || [];

  const rows = allRows.filter(r => {
    const s = tabSearch.toLowerCase();
    if (!s && !roleFilter) return true;
    const matchRole = !roleFilter || r.role === roleFilter;
    if (!s) return matchRole;
    const text = [r.username, r.first_name, r.last_name, r.email, r.branch_name, r.position, r.branch_id, r.city, r.type_name]
      .filter(Boolean).join(' ').toLowerCase();
    return text.includes(s) && matchRole;
  });

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Admin Panel</span>
        ${ADD_LABELS[tab] && html`
          <div className="topbar-right">
            <button className="btn btn-primary btn-sm" onClick=${() => openModal(tab, null)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${ADD_LABELS[tab]}
            </button>
          </div>
        `}
      </header>

      <div className="page">
        <div className="tabs">
          ${TABS.map(([key, label]) => html`
            <div key=${key} className=${'tab' + (tab === key ? ' active' : '')}
              onClick=${() => { setTab(key); setTabSearch(''); setRoleFilter(''); }}>${label}</div>
          `)}
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">${rows.length} ${tab === 'account-types' ? 'type(s)' : tab.replace('-', ' ')}</span>
            <div className="filter-bar">
              <div className="search-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" className="form-input" placeholder="Filter..." value=${tabSearch}
                  onChange=${e => setTabSearch(e.target.value)} style=${{ width:180 }} />
              </div>
              ${tab === 'users' && html`
                <select className="form-select" style=${{ width:130 }} value=${roleFilter}
                  onChange=${e => setRoleFilter(e.target.value)}>
                  <option value="">All roles</option>
                  <option value="manager">Manager</option>
                  <option value="teller">Teller</option>
                  <option value="auditor">Auditor</option>
                </select>
              `}
              ${(tabSearch || roleFilter) && html`
                <button className="btn btn-secondary btn-sm" onClick=${() => { setTabSearch(''); setRoleFilter(''); }}>Clear</button>
              `}
              <button className="btn btn-secondary btn-sm" onClick=${() => loadTab(tab)}>Refresh</button>
            </div>
          </div>

          ${loading
            ? html`<div className="empty-state"><${Spinner} large /></div>`
            : rows.length === 0
              ? html`
                <div className="empty-state">
                  <div className="empty-state-title">No results</div>
                  <div className="empty-state-text">${tabSearch ? `No matches for "${tabSearch}"` : 'Nothing here yet.'}</div>
                </div>
              `
              : tab === 'users' ? html`
                <table>
                  <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Status</th><th>Employee</th><th>Last login</th><th></th></tr></thead>
                  <tbody>${rows.map(u => html`
                    <tr key=${u.user_id}>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${u.user_id}</td>
                      <td style=${{ fontWeight:500 }}>${u.username}</td>
                      <td><${RoleBadge} role=${u.role} /></td>
                      <td><${StatusBadge} status=${u.status} /></td>
                      <td style=${{ fontSize:12 }}>${u.employee_name || '-'}</td>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${fmt.datetime(u.last_login_at)}</td>
                      <td>
                        <div style=${{ display:'flex', gap:6 }}>
                          <button className="btn btn-ghost btn-sm" onClick=${() => openModal('users', u)}>Edit</button>
                          ${u.status === 'locked' ? html`
                            <button className="btn btn-sm"
                              style=${{ background:'rgba(245,158,11,.1)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.2)' }}
                              onClick=${() => handleUnlock(u.user_id)}>Unlock</button>
                          ` : null}
                          <button className="btn btn-ghost btn-sm" onClick=${() => openResetPassword(u.user_id)}>Reset pwd</button>
                        </div>
                      </td>
                    </tr>
                  `)}</tbody>
                </table>
              ` : tab === 'employees' ? html`
                <table>
                  <thead><tr><th>ID</th><th>Name</th><th>Position</th><th>Branch</th><th>Email</th><th>Hire date</th><th>Salary</th><th></th></tr></thead>
                  <tbody>${rows.map(e => html`
                    <tr key=${e.employee_id}>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${e.employee_id}</td>
                      <td style=${{ fontWeight:500 }}>${e.first_name} ${e.last_name}</td>
                      <td style=${{ fontSize:12 }}>${e.position || '-'}</td>
                      <td style=${{ fontSize:12 }}>${e.branch_name || e.branch_id || '-'}</td>
                      <td style=${{ fontSize:12 }}>${e.email || '-'}</td>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${e.hire_date ? fmt.date(e.hire_date) : '-'}</td>
                      <td style=${{ fontSize:12 }}>${e.salary != null ? fmt.currency(e.salary) : '-'}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick=${() => openModal('employees', e)}>Edit</button></td>
                    </tr>
                  `)}</tbody>
                </table>
              ` : tab === 'branches' ? html`
                <table>
                  <thead><tr><th>ID</th><th>Name</th><th>City</th><th>Address</th><th>Phone</th><th>Est.</th><th></th></tr></thead>
                  <tbody>${rows.map(b => html`
                    <tr key=${b.branch_id}>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${b.branch_id}</td>
                      <td style=${{ fontWeight:500 }}>${b.branch_name}</td>
                      <td>${b.city || '-'}</td>
                      <td style=${{ fontSize:12, color:'var(--muted-foreground)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>${b.address || '-'}</td>
                      <td style=${{ fontSize:12 }}>${b.phone || '-'}</td>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${b.established_date ? fmt.date(b.established_date) : '-'}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick=${() => openModal('branches', b)}>Edit</button></td>
                    </tr>
                  `)}</tbody>
                </table>
              ` : tab === 'account-types' ? html`
                <table>
                  <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
                  <tbody>${rows.map(t => html`
                    <tr key=${t.account_type_id}>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${t.account_type_id}</td>
                      <td style=${{ fontWeight:500 }}>${t.type_name}</td>
                      <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${t.description || '-'}</td>
                    </tr>
                  `)}</tbody>
                </table>
              ` : tab === 'rules' ? html`
                <table>
                  <thead><tr><th>Code</th><th>Value</th><th>Description</th><th>Active</th><th>Last updated</th><th></th></tr></thead>
                  <tbody>${rows.map(r => html`
                    <tr key=${r.code}>
                      <td style=${{ fontFamily:'ui-monospace,monospace', fontSize:12, fontWeight:600 }}>${r.code}</td>
                      <td style=${{ fontSize:13, fontWeight:600, color:'#7adf2e', fontFamily:'ui-monospace,monospace' }}>
                        ${typeof r.value === 'number' ? fmt.currency(r.value) : JSON.stringify(r.value)}
                      </td>
                      <td style=${{ fontSize:12, color:'var(--muted-foreground)', maxWidth:260 }}>${r.description || '-'}</td>
                      <td>
                        <span style=${{ display:'inline-block', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600, background: r.active ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: r.active ? '#22c55e' : '#ef4444', border: `1px solid ${r.active ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
                          ${r.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>
                        ${r.updated_at ? fmt.datetime(r.updated_at) : '-'}
                        ${r.updated_by_username ? html` · ${r.updated_by_username}` : null}
                      </td>
                      <td><button className="btn btn-ghost btn-sm" onClick=${() => openModal('rules', r)}>Edit</button></td>
                    </tr>
                  `)}</tbody>
                </table>
              ` : null
          }
        </div>
      </div>
      <${Modal}
        open=${!!modal}
        onClose=${() => setModal(null)}
        title=${modal?.title}
        large
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick=${modal?.type === 'reset-password' ? handleResetPassword : handleSave} disabled=${saving}>
            ${saving ? html`<${Spinner} />` : 'Save'}
          </button>
        `}
      >
        ${modal?.type === 'users' ? html`
          <form onSubmit=${handleSave}>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Username <span className="form-req">*</span></label><input className="form-input" value=${form.username} onChange=${e => setField('username', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Role <span className="form-req">*</span></label>
                <select className="form-select" value=${form.role} onChange=${e => setField('role', e.target.value)}>
                  ${['manager','teller','auditor'].map(r => html`<option key=${r} value=${r}>${r}</option>`)}
                </select>
              </div>
            </div>
            ${!modal?.editItem ? html`<div className="form-group"><label className="form-label">Password <span className="form-req">*</span></label><input type="password" className="form-input" value=${form.password} onChange=${e => setField('password', e.target.value)} /></div>` : null}
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-select" value=${form.status} onChange=${e => setField('status', e.target.value)}>
                  ${['active','disabled','locked'].map(s => html`<option key=${s} value=${s}>${s}</option>`)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Linked employee</label>
                <select className="form-select" value=${form.employee_id} onChange=${e => setField('employee_id', e.target.value)}>
                  <option value="">None</option>
                  ${extraData.empList?.map(emp => html`<option key=${emp.employee_id} value=${emp.employee_id}>${emp.first_name} ${emp.last_name}</option>`)}
                </select>
              </div>
            </div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : modal?.type === 'employees' ? html`
          <form onSubmit=${handleSave}>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">First name <span className="form-req">*</span></label><input className="form-input" value=${form.first_name} onChange=${e => setField('first_name', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Last name <span className="form-req">*</span></label><input className="form-input" value=${form.last_name} onChange=${e => setField('last_name', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Position <span className="form-req">*</span></label><input className="form-input" value=${form.position} onChange=${e => setField('position', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Salary <span className="form-req">*</span></label><input type="number" className="form-input" value=${form.salary} onChange=${e => setField('salary', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value=${form.email} onChange=${e => setField('email', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value=${form.phone} onChange=${e => setField('phone', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Branch <span className="form-req">*</span></label>
                <select className="form-select" value=${form.branch_id} onChange=${e => setField('branch_id', e.target.value)}>
                  <option value="">Select...</option>
                  ${extraData.branchList?.map(b => html`<option key=${b.branch_id} value=${b.branch_id}>${b.branch_name}</option>`)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Hire date <span className="form-req">*</span></label><input type="date" className="form-input" value=${form.hire_date} onChange=${e => setField('hire_date', e.target.value)} /></div>
            </div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : modal?.type === 'branches' ? html`
          <form onSubmit=${handleSave}>
            <div className="form-group"><label className="form-label">Branch name <span className="form-req">*</span></label><input className="form-input" value=${form.branch_name} onChange=${e => setField('branch_name', e.target.value)} /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">City <span className="form-req">*</span></label><input className="form-input" value=${form.city} onChange=${e => setField('city', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Address <span className="form-req">*</span></label><input className="form-input" value=${form.address} onChange=${e => setField('address', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Phone <span className="form-req">*</span></label><input className="form-input" value=${form.phone} onChange=${e => setField('phone', e.target.value)} /></div>
              ${!modal?.editItem ? html`<div className="form-group"><label className="form-label">Established date <span className="form-req">*</span></label><input type="date" className="form-input" value=${form.established_date} onChange=${e => setField('established_date', e.target.value)} /></div>` : null}
            </div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : modal?.type === 'account-types' ? html`
          <form onSubmit=${handleSave}>
            <div className="form-group"><label className="form-label">Type name <span className="form-req">*</span></label><input className="form-input" value=${form.type_name} onChange=${e => setField('type_name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea form-input" value=${form.description} onChange=${e => setField('description', e.target.value)} /></div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : modal?.type === 'reset-password' ? html`
          <form onSubmit=${handleResetPassword}>
            <div className="form-group"><label className="form-label">New password <span className="form-req">*</span></label><input type="password" className="form-input" value=${form.new_password} onChange=${e => setField('new_password', e.target.value)} /></div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : modal?.type === 'rules' ? html`
          <form onSubmit=${handleSave} style="display:flex;flex-direction:column;gap:14px;">
            <div style="padding:10px 14px;background:var(--muted);border-radius:8px;font-size:12px;">
              <div style="font-family:ui-monospace,monospace;font-weight:700;color:var(--foreground);margin-bottom:3px;">${modal?.editItem?.code}</div>
              <div style="color:var(--muted-foreground);">${modal?.editItem?.description || 'No description.'}</div>
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Value <span className="form-req">*</span></label>
              <input className="form-input" value=${form.value}
                onChange=${e => setField('value', e.target.value)}
                placeholder="Numeric value, e.g. 50000000" style="font-family:ui-monospace,monospace;" />
              <div style="font-size:11.5px;color:var(--muted-foreground);margin-top:4px;">Enter a number or valid JSON.</div>
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Description</label>
              <input className="form-input" value=${form.description}
                onChange=${e => setField('description', e.target.value)} />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Active</label>
              <select className="form-select" value=${form.active} onChange=${e => setField('active', e.target.value)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            ${formError ? html`<div className="alert alert-danger">${formError}</div>` : null}
          </form>
        ` : null}
      <//>
    </>
  `;
}
