"""Downloader diagnostic privacy and error categorization without optional cloud SDKs."""
import ast
import logging
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

class MediaDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        tree=ast.parse((Path(__file__).parents[1]/'app.py').read_text(encoding='utf-8-sig'))
        nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ('run','downloader')]
        self.process=Mock(return_value=SimpleNamespace(returncode=1,stderr='',stdout=''))
        scope={'subprocess':SimpleNamespace(run=self.process),'logging':logging}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<media-diagnostics>','exec'),scope)
        self.run=scope['run'];self.downloader=scope['downloader']

    def test_authenticated_errors_classify_known_causes_without_exposing_session_data(self):
        cases=[('n challenge solving failed','JavaScript challenge could not be solved'),('Requested format is not available','Requested source format is unavailable'),('Only images are available','images but no playable streams'),('HTTP Error 403','HTTP 403'),('PO TOKEN','playback token'),('Sign in to confirm you are not a bot','sign-in verification'),('unknown failure','detailed output withheld')]
        for stderr,expected in cases:
            with self.subTest(stderr=stderr):
                self.process.return_value.stderr=stderr+'\nCookie: private-session-value'
                with self.assertLogs('king_sports.music',level='WARNING') as logs:
                    with self.assertRaises(RuntimeError):self.run(['yt-dlp','--cookies','/tmp/session'])
                text=' '.join(logs.output);self.assertIn(expected,text);self.assertNotIn('private-session-value',text)

    def test_challenge_warnings_remain_available_to_safe_classifier(self):
        command=self.downloader('--skip-download')
        self.assertNotIn('--no-warnings',command)
        self.assertIn('node',command)

if __name__=='__main__':unittest.main()
