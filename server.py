from http.server import BaseHTTPRequestHandler, HTTPServer

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index"):
            data, code = open("index.html", "rb").read(), 200
        else:
            try:
                data, code = open(self.path[1:], "rb").read(), 200
            except FileNotFoundError:
                data, code = b"404 Not Found", 404

        self.send_response(code)
        self.end_headers()
        self.wfile.write(data)

if __name__ == "__main__":
    server_address = ("", 8080)
    httpd = HTTPServer(server_address, RequestHandler)
    print("Server started on port 8080")
    httpd.serve_forever()
