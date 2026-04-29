import htm from 'htm';
import { createElement, Fragment } from 'react';

function parseCss(str) {
  const obj = {};
  str.split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx < 0) return;
    const k = rule.slice(0, idx).trim();
    const v = rule.slice(idx + 1).trim();
    if (k && v) obj[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  });
  return obj;
}

function h(type, props, ...children) {
  if (props && typeof props.style === 'string') {
    props = { ...props, style: parseCss(props.style) };
  }
  return createElement(type || Fragment, props, ...children);
}

export const html = htm.bind(h);
