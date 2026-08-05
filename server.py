import http.server
import socketserver
import os

PORT = 5000

# Files that must be served as raw text/XML with no SPA fallback
STATIC_PASSTHROUGH = {
    "/robots.txt":   ("text/plain; charset=utf-8",  "robots.txt"),
    "/sitemap.xml":  ("application/xml; charset=utf-8", "sitemap.xml"),
}

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        if self.path in STATIC_PASSTHROUGH:
            content_type, filename = STATIC_PASSTHROUGH[self.path]
            filepath = os.path.join(os.getcwd(), filename)
            if os.path.isfile(filepath):
                with open(filepath, "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                # end_headers() adds Cache-Control via our override — no need to duplicate it here
                self.end_headers()
                self.wfile.write(data)
                return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
    print(f"Serving on port {PORT} with no-cache headers")
    httpd.serve_forever()
