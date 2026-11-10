# 本地开发服务器：带 no-cache 头，避免浏览器启发式缓存卡住更新（python http.server 无此头）。
# 用法：python dev-server.py [端口，默认 8765]；正式分发仍按 README 用任意静态服务器 + ?v= 版本参数。
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
