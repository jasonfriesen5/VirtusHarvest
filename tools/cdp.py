#!/usr/bin/env python3
"""Minimal CDP Runtime.evaluate over a raw WebSocket (stdlib only).

Usage: cdp.py <ws-url> '<js expression>'
"""
import sys, socket, base64, os, struct, json
from urllib.parse import urlparse


def ws_connect(url):
    u = urlparse(url)
    s = socket.create_connection((u.hostname, u.port), timeout=15)
    key = base64.b64encode(os.urandom(16)).decode()
    path = u.path or "/"
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {u.hostname}:{u.port}\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = s.recv(4096)
        if not chunk:
            raise RuntimeError("handshake closed early")
        buf += chunk
    if b"101" not in buf.split(b"\r\n")[0]:
        raise RuntimeError("upgrade failed: " + buf.split(b"\r\n")[0].decode())
    return s


def ws_send(s, payload):
    data = payload.encode()
    hdr = bytearray([0x81])                      # FIN + text
    n = len(data)
    if n < 126:
        hdr.append(0x80 | n)
    elif n < (1 << 16):
        hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
    else:
        hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
    mask = os.urandom(4)
    hdr += mask
    s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def _recv_exact(s, n):
    out = b""
    while len(out) < n:
        c = s.recv(n - len(out))
        if not c:
            raise RuntimeError("closed")
        out += c
    return out


def ws_recv(s):
    b0, b1 = _recv_exact(s, 2)
    ln = b1 & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", _recv_exact(s, 2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", _recv_exact(s, 8))[0]
    return _recv_exact(s, ln).decode("utf-8", "replace")


def main():
    ws_url, expr = sys.argv[1], sys.argv[2]
    s = ws_connect(ws_url)
    ws_send(s, json.dumps({
        "id": 1, "method": "Runtime.evaluate",
        "params": {"expression": expr, "awaitPromise": True,
                   "returnByValue": True, "timeout": 12000},
    }))
    for _ in range(40):                          # skip unrelated events
        msg = json.loads(ws_recv(s))
        if msg.get("id") == 1:
            r = msg.get("result", {})
            if "exceptionDetails" in r:
                print("EXCEPTION:", json.dumps(r["exceptionDetails"])[:600])
            print(json.dumps(r.get("result", {}).get("value"), indent=1))
            return
    print("no reply")


main()
