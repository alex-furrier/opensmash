"""The existing Python listener must reject requests without its private token."""
import http.client
from http.server import ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch
from tools import serve_melee


class SharedHostHelperTests(unittest.TestCase):
    def test_real_get_head_and_mutations_require_helper_token(self):
        reached = []

        class Handler(serve_melee.Handler):
            def get_resource(self):
                reached.append(self.command)
                return self.json({'fixture': True})

            def log_message(self, *_args):
                pass

        with patch.object(serve_melee, 'TOKEN', 'f' * 64):
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                def request(method, route='/fixture', token=None):
                    connection = http.client.HTTPConnection(*server.server_address, timeout=2)
                    headers = {} if token is None else {'X-OpenSmash-Token': token}
                    connection.request(method, route, headers=headers)
                    response = connection.getresponse()
                    status, body = response.status, response.read()
                    connection.close()
                    return status, body

                for token in (None, 'incorrect'):
                    for method in ('GET', 'HEAD'):
                        self.assertEqual(request(method, token=token)[0], 403)
                    for route in ('/api/setup/disc', '/api/native-fit/source/fighter', '/api/imports'):
                        self.assertEqual(request('POST', route, token)[0], 403)
                    self.assertEqual(request('DELETE', '/api/imports/import-' + 'a' * 24, token)[0], 403)
                self.assertEqual(reached, [])
                self.assertEqual(request('GET', token='f' * 64)[0], 200)
                self.assertEqual(request('HEAD', token='f' * 64), (200, b''))
                self.assertEqual(request('POST', '/not-a-real-mutation', 'f' * 64)[0], 404)
                self.assertEqual(reached, ['GET', 'HEAD'])
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
