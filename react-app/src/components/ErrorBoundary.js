import { html } from '../lib/html.js';
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return html`
        <div style=${{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'40px',fontFamily:'monospace'}}>
          <div style=${{maxWidth:'700px',width:'100%',background:'#1a0a0a',border:'1px solid rgba(239,68,68,.3)',borderRadius:'12px',padding:'28px'}}>
            <div style=${{color:'#ef4444',fontSize:'16px',fontWeight:700,marginBottom:'12px'}}>Application Error</div>
            <div style=${{color:'#fca5a5',fontSize:'13px',marginBottom:'16px'}}>${this.state.error.message}</div>
            <pre style=${{color:'#f87171',fontSize:'11px',whiteSpace:'pre-wrap',overflowX:'auto',background:'#0a0000',padding:'16px',borderRadius:'8px',border:'1px solid rgba(239,68,68,.2)'}}>${this.state.error.stack}</pre>
            <button
              onClick=${() => { this.setState({ error: null }); window.location.reload(); }}
              style=${{marginTop:'16px',background:'rgba(239,68,68,.15)',border:'1px solid rgba(239,68,68,.3)',color:'#ef4444',padding:'8px 16px',borderRadius:'7px',cursor:'pointer',fontFamily:'inherit',fontSize:'13px'}}
            >
              Reload page
            </button>
          </div>
        </div>
      `;
    }
    return this.props.children;
  }
}


