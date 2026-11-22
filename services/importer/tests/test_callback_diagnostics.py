"""Exercise callback diagnostics without importing cloud SDK/native dependencies."""
import ast
import logging
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

source = ast.parse((Path(__file__).parents[1] / 'app.py').read_text(encoding='utf-8'))
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'callback')

class CallbackDiagnosticsTests(unittest.TestCase):
    def call(self, response):
        scope = {'requests': SimpleNamespace(request=Mock(return_value=response)), 'logging': logging, 'os': SimpleNamespace(environ={'MUSIC_SERVICE_TOKEN': 'private-token'})}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<callback>', 'exec'), scope)
        return scope['callback'](SimpleNamespace(callbackUrl='https://api.test/callback'), 'POST', {'status': 'ready'})

    def test_validation_reason_logged_without_credentials(self):
        response = Mock(ok=False, status_code=409)
        response.json.return_value = {'error': 'Artwork or lyrics data is invalid', 'secret': 'private-token'}
        response.raise_for_status.side_effect = RuntimeError('rejected')
        with self.assertLogs(level='WARNING') as logs, self.assertRaises(RuntimeError):
            self.call(response)
        self.assertIn('Artwork or lyrics data is invalid', logs.output[0])
        self.assertNotIn('private-token', logs.output[0])

    def test_arbitrary_or_invalid_response_body_never_logged(self):
        for body in [{'error': 'private-token'}, None]:
            response = Mock(ok=False, status_code=500)
            response.json.return_value = body
            with self.assertLogs(level='WARNING') as logs:
                self.call(response)
            self.assertIn('request rejected', logs.output[0])
            self.assertNotIn('private-token', logs.output[0])

    def test_success_unchanged(self):
        response = Mock(ok=True)
        response.json.return_value = {'ok': True}
        self.assertEqual(self.call(response), {'ok': True})
        response.raise_for_status.assert_called_once()

if __name__ == '__main__':
    unittest.main()
