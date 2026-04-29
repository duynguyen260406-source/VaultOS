import { html } from '../lib/html.js';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { debounce } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner, LoadingRow } from '../components/Spinner.js';

const LIMIT = 50;
const EMPTY_FORM = { first_name:'', last_name:'', date_of_birth:'', gender:'', email:'', phone:'', city:'', address:'' };

export default function Customers() {
  const { user }   = useAuth();
  const toast      = useToast();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const canCreate  = ['manager', 'teller'].includes(user?.role);

  const [search,  setSearch]  = useState('');
  const [rows,    setRows]    = useState(null);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [modalOpen,    setModalOpen]    = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState('');
  const [form,         setForm]         = useState(EMPTY_FORM);

  const load = useCallback(async (term, pg) => {
    setLoading(true); setError('');
    try {
      const data = term.length >= 1
        ? await api.searchCustomers(term)
        : await api.listCustomers({ limit: LIMIT, offset: (pg - 1) * LIMIT });
      const customers = data.customers || [];
      setRows(customers);
      setTotal(data.total || customers.length);
    } catch (e) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }, []);

  const doSearch = useCallback(debounce((term) => { setPage(1); load(term, 1); }, 350), [load]);

  useEffect(() => { load('', 1); }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'new' && canCreate) openCreate();
  }, [searchParams]);

  function openCreate() {
    setForm(EMPTY_FORM); setCreateError(''); setModalOpen(true);
  }

  const handleSearch = (val) => { setSearch(val); doSearch(val); };
  const handlePage   = (p)   => { setPage(p); load(search, p); };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.date_of_birth || !form.gender || !form.email || !form.phone) {
      setCreateError('Please fill all required fields.'); return;
    }
    setCreating(true); setCreateError('');
    try {
      const created = await api.createCustomer(form);
      toast.success(`Customer ${created.first_name} ${created.last_name} created.`);
      setModalOpen(false);
      navigate('/customers/' + created.customer_id);
    } catch (e) { setCreateError(e.message); }
    finally { setCreating(false); }
  };

  const pages = search ? 0 : Math.ceil(total / LIMIT);

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Customers</span>
        <div className="topbar-right">
          ${canCreate && html`
            <button className="btn btn-primary btn-sm" onClick=${openCreate}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Customer
            </button>
          `}
        </div>
      </header>

      <div className="page">
        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">All customers</span>
            <div className="filter-bar">
              <div className="search-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" className="form-input" placeholder="Search by name..."
                  value=${search} onChange=${e => handleSearch(e.target.value)}
                  style=${{ width:240 }} />
              </div>
              ${search && html`
                <button className="btn btn-secondary btn-sm" onClick=${() => { setSearch(''); load('', 1); setPage(1); }}>Clear</button>
              `}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Gender</th><th>Email</th><th>Phone</th><th>City</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${loading && html`<${LoadingRow} cols=${7} />`}
              ${error && html`<tr><td colSpan="7"><div className="alert alert-danger" style=${{ margin:16 }}>${error}</div></td></tr>`}
              ${!loading && rows?.length === 0 && html`
                <tr><td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-icon-wrap">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div className="empty-state-title">No customers found</div>
                    <div className="empty-state-text">${search ? `No results for "${search}"` : 'No customers yet.'}</div>
                  </div>
                </td></tr>
              `}
              ${!loading && rows?.map(c => html`
                <tr key=${c.customer_id} className="clickable" onClick=${() => navigate('/customers/' + c.customer_id)}>
                  <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${c.customer_id}</td>
                  <td style=${{ fontWeight:500 }}>${c.first_name} ${c.last_name}</td>
                  <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${c.gender || '-'}</td>
                  <td style=${{ fontSize:12.5 }}>${c.email || '-'}</td>
                  <td style=${{ fontSize:12.5 }}>${c.phone || '-'}</td>
                  <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${c.city || '-'}</td>
                  <td style=${{ textAlign:'right' }}>
                    <${Link} to=${'/customers/' + c.customer_id} className="btn btn-ghost btn-sm"
                      onClick=${e => e.stopPropagation()}>View<//>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>

          <div className="tbl-foot">
            <span>${fmt_total(total, search, rows)}</span>
            ${pages > 1 && html`
              <div className="pg-btns">
                <button className="pg-btn" disabled=${page === 1} onClick=${() => handlePage(page - 1)}>‹</button>
                ${Array.from({ length: Math.min(5, pages) }, (_, i) => {
                  const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
                  if (p > pages) return null;
                  return html`<button key=${p} className=${'pg-btn' + (p === page ? ' pg-active' : '')} onClick=${() => handlePage(p)}>${p}</button>`;
                })}
                <button className="pg-btn" disabled=${page === pages} onClick=${() => handlePage(page + 1)}>›</button>
              </div>
            `}
          </div>
        </div>
      </div>

      <${Modal}
        open=${modalOpen}
        onClose=${() => setModalOpen(false)}
        title="New Customer"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleCreate} disabled=${creating}>
            ${creating ? html`<${Spinner} />` : 'Create customer'}
          </button>
        `}
      >
        <form onSubmit=${handleCreate}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">First name <span className="form-req">*</span></label>
              <input className="form-input" value=${form.first_name} onChange=${e => setField('first_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Last name <span className="form-req">*</span></label>
              <input className="form-input" value=${form.last_name} onChange=${e => setField('last_name', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Date of birth <span className="form-req">*</span></label>
              <input type="date" className="form-input" value=${form.date_of_birth} onChange=${e => setField('date_of_birth', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender <span className="form-req">*</span></label>
              <select className="form-select" value=${form.gender} onChange=${e => setField('gender', e.target.value)}>
                <option value="">Select...</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email <span className="form-req">*</span></label>
            <input type="email" className="form-input" value=${form.email} onChange=${e => setField('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone <span className="form-req">*</span></label>
            <input className="form-input" value=${form.phone} onChange=${e => setField('phone', e.target.value)} placeholder="+84..." />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" value=${form.city} onChange=${e => setField('city', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-input" value=${form.address} onChange=${e => setField('address', e.target.value)} />
            </div>
          </div>
          ${createError && html`<div className="alert alert-danger">${createError}</div>`}
        </form>
      <//>
    </>
  `;
}

function fmt_total(total, search, rows) {
  if (search) return rows ? `${rows.length} result${rows.length !== 1 ? 's' : ''} for "${search}"` : '';
  return `${total} customer${total !== 1 ? 's' : ''}`;
}
