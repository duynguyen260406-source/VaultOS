import { html } from './lib/html.js';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import Layout from './components/Layout.js';
import Landing from './pages/Landing.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Customers from './pages/Customers.js';
import CustomerDetail from './pages/CustomerDetail.js';
import Accounts from './pages/Accounts.js';
import AccountDetail from './pages/AccountDetail.js';
import Transactions from './pages/Transactions.js';
import Reports from './pages/Reports.js';
import Audit from './pages/Audit.js';
import Admin from './pages/Admin.js';
import Approvals from './pages/Approvals.js';
import EndOfDay from './pages/EndOfDay.js';
import Loans from './pages/Loans.js';
import CustomerWatchlist from './pages/CustomerWatchlist.js';
import RegulatoryReports from './pages/RegulatoryReports.js';
import Sanctions from './pages/Sanctions.js';
import CustomerNetwork from './pages/CustomerNetwork.js';
import Profile from './pages/Profile.js';
import Page403 from './pages/Page403.js';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return html`<${Navigate} to="/login" replace />`;
  if (roles && !roles.includes(user.role)) return html`<${Navigate} to="/403" replace />`;
  return children;
}

function AppRoutes() {
  return html`
    <${HashRouter}>
      <${Routes}>
        <${Route} path="/" element=${html`<${Landing} />`} />
        <${Route} path="/login" element=${html`<${Login} />`} />
        <${Route} path="/403" element=${html`<${Page403} />`} />

        <${Route} element=${html`<${ProtectedRoute}><${Layout} /></${ProtectedRoute}>`}>
          <${Route} path="/dashboard"  element=${html`<${Dashboard} />`} />
          <${Route} path="/customers"  element=${html`<${Customers} />`} />
          <${Route} path="/customers/:id" element=${html`<${CustomerDetail} />`} />
          <${Route} path="/accounts"   element=${html`<${Accounts} />`} />
          <${Route} path="/accounts/:id" element=${html`<${AccountDetail} />`} />
          <${Route} path="/transactions" element=${html`
            <${ProtectedRoute} roles=${['manager','teller']}>
              <${Transactions} />
            <//>
          `} />
          <${Route} path="/reports" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${Reports} />
            <//>
          `} />
          <${Route} path="/audit" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${Audit} />
            <//>
          `} />
          <${Route} path="/regulatory" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${RegulatoryReports} />
            <//>
          `} />
          <${Route} path="/sanctions" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${Sanctions} />
            <//>
          `} />
          <${Route} path="/network" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${CustomerNetwork} />
            <//>
          `} />
          <${Route} path="/approvals" element=${html`<${Approvals} />`} />
          <${Route} path="/loans" element=${html`<${Loans} />`} />
          <${Route} path="/watchlist" element=${html`
            <${ProtectedRoute} roles=${['manager','auditor']}>
              <${CustomerWatchlist} />
            <//>
          `} />
          <${Route} path="/eod" element=${html`
            <${ProtectedRoute} roles=${['manager','teller']}>
              <${EndOfDay} />
            <//>
          `} />
          <${Route} path="/admin" element=${html`
            <${ProtectedRoute} roles=${['manager']}>
              <${Admin} />
            <//>
          `} />
          <${Route} path="/profile" element=${html`<${Profile} />`} />
        <//>

        <${Route} path="*" element=${html`<${Navigate} to="/" replace />`} />
      <//>
    <//>
  `;
}

export default function App() {
  return html`
    <${AuthProvider}>
      <${ToastProvider}>
        <${AppRoutes} />
      <//>
    <//>
  `;
}


