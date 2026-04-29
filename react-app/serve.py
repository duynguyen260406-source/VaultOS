"""
Standalone development server for the React app.
Serves react-app/ at http://localhost:3000 with SPA fallback.
API calls are proxied to http://localhost:8000.

Usage:  python serve.py
"""
import http.server
import mimetypes
import os
import urllib.request
import urllib.error

PORT = 3000
API_BASE = 'http://localhost:8000'
ROOT = os.path.dirname(os.path.abspath(__file__))

# Ensure correct MIME types on Windows (registry may be missing these)
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/png', '.png')


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # Proxy API paths to FastAPI backend
        api_prefixes = ('/auth/', '/customers', '/accounts', '/transactions',
                        '/reports', '/branches', '/employees', '/account-types',
                        '/users', '/audit', '/health')
        if any(self.path == p or self.path.startswith(p + '/') or self.path.startswith(p + '?')
               for p in api_prefixes):
            self._proxy()
            return

        # For static files, serve directly; unknown paths → SPA fallback
        file_path = self.translate_path(self.path)
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            self.path = '/index.html'
        super().do_GET()

    def do_POST(self):
        self._proxy()

    def do_PATCH(self):
        self._proxy()

    def do_DELETE(self):
        self._proxy()

    def do_PUT(self):
        self._proxy()

    def _proxy(self):
        url = API_BASE + self.path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in ('host', 'content-length')}
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ('transfer-encoding', 'connection'):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(502, f'API proxy error: {e}')

    def log_message(self, format, *args):
        pass  # suppress request logs


if __name__ == '__main__':
    with http.server.HTTPServer(('', PORT), SPAHandler) as httpd:
        print(f'React app  : http://localhost:{PORT}')
        print(f'API proxy  : {API_BASE}')
        print('Press Ctrl+C to stop.')
        httpd.serve_forever()
